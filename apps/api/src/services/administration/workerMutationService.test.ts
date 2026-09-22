import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";
import { hashPassword, verifyPassword } from "../../auth/passwordHasher.js";
import { setPostgresPoolForTests, type PgPool } from "../../db/postgres.js";
import { createWorker, resolveWorkerInvitation, updateWorker, validateWorkerMutation, WorkerMutationError } from "./workerMutationService.js";

const base = { firstName: " Ana ", lastName: " Pérez ", dni: "12.345.678", email: "ANA@EXAMPLE.COM", password: "segura12345", role: "TRABAJADOR", hasFixedCompensation: false, fixedCompensationAmount: null, fixedCompensationFrequency: null };
void test("normaliza DNI/correo y exige las reglas públicas de contraseña", async () => {
  const input = validateWorkerMutation(base, true);
  assert.equal(input.dni, "12345678"); assert.equal(input.email, "ana@example.com");
  const split = validateWorkerMutation({ ...base, contactEmail: "CONTACTO@EXAMPLE.COM", accessEmail: "ACCESO@EXAMPLE.COM" }, true);
  assert.equal(split.contactEmail, "contacto@example.com"); assert.equal(split.accessEmail, "acceso@example.com");
  assert.throws(() => validateWorkerMutation({ ...base, password: "demasiadocorta" }, true), WorkerMutationError);
  const hash = await hashPassword(input.password!); assert.notEqual(hash, input.password); assert.equal(await verifyPassword(input.password!, hash), true);
});
void test("FIXED y VARIABLE respetan la invariantes de monto", () => {
  assert.equal(validateWorkerMutation({ ...base, hasFixedCompensation: true, fixedCompensationAmount: 0, fixedCompensationFrequency: "MONTHLY", currencyCode: "ARS" }, true).fixedCompensationAmount, 0);
  assert.throws(() => validateWorkerMutation({ ...base, hasFixedCompensation: true, fixedCompensationAmount: -1, fixedCompensationFrequency: "MONTHLY", currencyCode: "ARS" }, true));
  assert.throws(() => validateWorkerMutation({ ...base, hasFixedCompensation: false, fixedCompensationAmount: 1, fixedCompensationFrequency: null }, true));
});
void test("roles operativos no heredan privilegios administrativos de Director", () => {
  for (const role of ["TRABAJADOR", "INSTRUCTOR"] as const) {
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("workers.manage" as never));
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("club:manage" as never));
  }
});
void test("SQL contiene auditoría previa, gate, compatibilidad y verificaciones", () => {
  const sql=readFileSync(new URL("../../../../../docs/dbeaver/diagnostics/workers-payment-and-roles.sql",import.meta.url),"utf8");
  assert.match(sql,/AUDITORÍA \(solo lectura\)/); assert.match(sql,/AUDIT_GATE_FAILED/); assert.match(sql,/COMPATIBILIDAD TEMPORAL/);
  assert.match(sql,/upper\(role\.code\) in \('TRABAJADOR', 'INSTRUCTOR'\)/); assert.match(sql,/club:manage/);
  assert.match(sql,/lower\(existing\.code\) = lower\(value\.code\)/);
  const executableSql = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql,/on conflict\s*\(club_id,\s*code\)/i);
});

void test("los instructores usan el estado canónico y no una columna is_active inexistente", () => {
  const source = readFileSync(new URL("./workerMutationService.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /miclub\.instructors[^`]*is_active/s);
  assert.match(source, /status='activa'/);
  assert.match(source, /status='suspendida'/);
  assert.match(source, /status='cancelada'/);
  assert.equal((source.match(/for update of e/g) ?? []).length, 2);
  assert.doesNotMatch(source, /left join miclub\.roles[^`]+for update`/s);
  assert.match(source, /input\.role === "INSTRUCTOR"[\s\S]+on conflict \(club_id,person_id\) do update set display_name=excluded\.display_name,status='activa'/);
});

void test("sólo una colisión de versión usa el código público de concurrencia", () => {
  const route = readFileSync(new URL("../../routes/administrationRoutes.ts", import.meta.url), "utf8");
  assert.match(route, /error\.code === "concurrency_conflict" \? "OPTIMISTIC_CONCURRENCY_CONFLICT"/);
  assert.doesNotMatch(route, /error\.code === "conflict" \? "OPTIMISTIC_CONCURRENCY_CONFLICT"/);
});

const actor = { userId: "10000000-0000-4000-8000-000000000001", membershipId: "10000000-0000-4000-8000-000000000002", clubId: "10000000-0000-4000-8000-000000000003" };
const existingBody = { ...base, password: undefined };
const mockPool = (respond: (sql: string, params: unknown[]) => Record<string, unknown>[]) => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = { query: (sql: string, params: unknown[] = []) => { statements.push({ sql, params }); return Promise.resolve({ rows: sql.includes("to_regclass('miclub.employees')") ? [{ employees: "miclub.employees" }] : respond(sql, params) }); }, release: () => undefined };
  return { pool: { ...client, connect: () => Promise.resolve(client), end: () => Promise.resolve() } as PgPool, statements };
};

void test("un email existente en otro club sólo crea una invitación tenant-scoped", async () => {
  const { pool, statements } = mockPool((sql) => {
    if (sql.includes("from miclub.users where lower")) return [{ id: "20000000-0000-4000-8000-000000000001" }];
    if (sql.includes("from miclub.roles")) return [{ id: "30000000-0000-4000-8000-000000000001" }];
    if (sql.includes("insert into miclub.worker_invitations")) return [{ id: "40000000-0000-4000-8000-000000000001" }];
    if (sql.includes("INSERT INTO miclub.audit_log")) return [{ id: "50000000-0000-4000-8000-000000000001" }];
    return [];
  });
  setPostgresPoolForTests(pool);
  try {
    assert.deepEqual(await createWorker(actor, existingBody), { invitationPending: true });
    assert.ok(statements.some(({ sql }) => sql.includes("insert into miclub.worker_invitations")));
    assert.ok(!statements.some(({ sql }) => sql.includes("insert into miclub.user_club_memberships")));
    assert.ok(!statements.some(({ sql }) => sql.includes("insert into miclub.employees")));
    await assert.rejects(createWorker(actor, { ...existingBody, password: "segura12345" }), WorkerMutationError);
    assert.equal(statements.filter(({ sql }) => sql.includes("insert into miclub.worker_invitations")).length, 1);
  } finally { setPostgresPoolForTests(undefined); }
});

void test("editar persiste rol laboral, DNI y contacto sin depender de Instructor", async () => {
  const updatedAt = "2026-09-21 12:00:00.123456+00";
  const employeeId = "70000000-0000-4000-8000-000000000001";
  const { pool, statements } = mockPool((sql) => {
    if (sql.includes("select e.*,coalesce") && sql.includes("for update of e")) return [{ id: employeeId, person_id: "70000000-0000-4000-8000-000000000002", membership_id: "70000000-0000-4000-8000-000000000003", role_code: "INSTRUCTOR", position: "INSTRUCTOR", updated_at: updatedAt, version_matches: true }];
    if (sql.includes("from miclub.instructors") && sql.includes("for update")) return [{ id: "70000000-0000-4000-8000-000000000004" }];
    if (sql.includes("from miclub.roles")) return [{ id: "70000000-0000-4000-8000-000000000005" }];
    if (sql.includes("update miclub.employees set sector_id")) return [{ id: employeeId, position: "TRABAJADOR" }];
    if (sql.includes("INSERT INTO miclub.audit_log")) return [{ id: "70000000-0000-4000-8000-000000000006" }];
    return [];
  });
  setPostgresPoolForTests(pool);
  try {
    await updateWorker(actor, employeeId, { ...existingBody, version: updatedAt, role: "TRABAJADOR", contactEmail: "contacto@example.com", accessEmail: "ana@example.com", compensationEffectiveFrom: "2026-09-21", removePhoto: true });
    const lockedEmployee = statements.find(({ sql }) => sql.includes("version_matches"));
    assert.equal(lockedEmployee?.params[2], updatedAt, "preserva el token PostgreSQL con microsegundos sin convertirlo en JavaScript");
    const personUpdate = statements.find(({ sql }) => sql.includes("update miclub.people set first_name"));
    assert.match(personUpdate?.sql ?? "", /dni=\$5[\s\S]*email=\$7/);
    assert.equal(personUpdate?.params[4], "12345678");
    assert.equal(personUpdate?.params[6], "contacto@example.com");
    assert.ok(statements.some(({ sql, params }) => sql.includes("update miclub.user_club_memberships") && params[2] === "70000000-0000-4000-8000-000000000005"));
    assert.ok(statements.some(({ sql }) => sql.includes("status='suspendida'")));
    assert.ok(statements.some(({ sql }) => sql.includes("update miclub.employee_photos set status='deleted'")), "la eliminación de foto ocurre dentro de la mutación guardada");
    assert.ok(!statements.some(({ sql }) => sql.includes("from miclub.activities")), "cambiar el rol no debe romper actividades cuyo responsable es el empleado");
  } finally { setPostgresPoolForTests(undefined); }
});

void test("editar rechaza una versión obsoleta antes de escribir", async () => {
  const { pool, statements } = mockPool((sql) => sql.includes("select e.*,coalesce") ? [{ id: "70000000-0000-4000-8000-000000000001", person_id: "70000000-0000-4000-8000-000000000002", membership_id: null, role_code: "TRABAJADOR", updated_at: "2026-09-21T12:00:00.000Z", version_matches: false }] : []);
  setPostgresPoolForTests(pool);
  try {
    await assert.rejects(updateWorker(actor, "70000000-0000-4000-8000-000000000001", { ...existingBody, version: "2026-09-20T12:00:00.000Z", systemAccessEnabled: false }), (error: unknown) => error instanceof WorkerMutationError && error.code === "concurrency_conflict");
    assert.ok(!statements.some(({ sql }) => sql.startsWith("update miclub.people") || sql.startsWith("update miclub.employees")));
  } finally { setPostgresPoolForTests(undefined); }
});

void test("una foto de un invitado permanece reservada durante toda la vigencia de la invitación", async () => {
  const photoFileId = "60000000-0000-4000-8000-000000000001";
  const { pool, statements } = mockPool((sql) => {
    if (sql.includes("from miclub.users where lower")) return [{ id: "20000000-0000-4000-8000-000000000001" }];
    if (sql.includes("from miclub.roles")) return [{ id: "30000000-0000-4000-8000-000000000001" }];
    if (sql.includes("update miclub.employee_photos set expires_at")) return [{ id: photoFileId }];
    if (sql.includes("insert into miclub.worker_invitations")) return [{ id: "40000000-0000-4000-8000-000000000001" }];
    if (sql.includes("INSERT INTO miclub.audit_log")) return [{ id: "50000000-0000-4000-8000-000000000001" }];
    return [];
  });
  setPostgresPoolForTests(pool);
  try {
    assert.deepEqual(await createWorker(actor, { ...existingBody, photoFileId }), { invitationPending: true });
    const reservation = statements.find(({ sql }) => sql.includes("update miclub.employee_photos set expires_at"));
    const invitation = statements.find(({ sql }) => sql.includes("insert into miclub.worker_invitations"));
    assert.equal(reservation?.params[0], photoFileId);
    assert.equal(reservation?.params[1], actor.clubId);
    assert.equal((reservation?.params[2] as Date).getTime(), (invitation?.params[4] as Date).getTime());
    assert.ok((reservation?.params[2] as Date).getTime() > Date.now() + 71 * 60 * 60 * 1000);
  } finally { setPostgresPoolForTests(undefined); }
});

void test("una invitación expirada no activa membresía ni permisos", async () => {
  const { pool, statements } = mockPool((sql) => sql.includes("from miclub.worker_invitations") ? [{ id: "40000000-0000-4000-8000-000000000001", club_id: actor.clubId, user_id: actor.userId, role_id: "30000000-0000-4000-8000-000000000001", invited_by: actor.userId, expires_at: new Date(Date.now() - 1_000), status: "pending", worker_data: existingBody }] : []);
  setPostgresPoolForTests(pool);
  try {
    await assert.rejects(resolveWorkerInvitation(actor.userId, "token-expirado", "accept"), WorkerMutationError);
    assert.ok(statements.some(({ sql }) => sql.includes("status='expired'")));
    assert.ok(!statements.some(({ sql }) => sql.includes("insert into miclub.user_club_memberships")));
  } finally { setPostgresPoolForTests(undefined); }
});

void test("el rechazo consume la invitación y audita sin crear membership", async () => {
  const { pool, statements } = mockPool((sql) => {
    if (sql.includes("from miclub.worker_invitations")) return [{ id: "40000000-0000-4000-8000-000000000001", club_id: actor.clubId, user_id: actor.userId, role_id: "30000000-0000-4000-8000-000000000001", invited_by: "10000000-0000-4000-8000-000000000009", expires_at: new Date(Date.now() + 60_000), status: "pending", worker_data: existingBody }];
    if (sql.includes("INSERT INTO miclub.audit_log")) return [{ id: "50000000-0000-4000-8000-000000000001" }];
    return [];
  });
  setPostgresPoolForTests(pool);
  try {
    assert.deepEqual(await resolveWorkerInvitation(actor.userId, "token-rechazado", "reject"), { accepted: false });
    assert.ok(statements.some(({ sql }) => sql.includes("status='rejected'")));
    assert.ok(!statements.some(({ sql }) => sql.includes("insert into miclub.user_club_memberships")));
    const auditParams = statements.find(({ sql }) => sql.includes("INSERT INTO miclub.audit_log"))!.params;
    assert.ok(!JSON.stringify(auditParams).includes("token-rechazado"));
  } finally { setPostgresPoolForTests(undefined); }
});
