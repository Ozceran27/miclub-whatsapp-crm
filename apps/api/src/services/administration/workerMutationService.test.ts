import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";
import { hashPassword, verifyPassword } from "../../auth/passwordHasher.js";
import { setPostgresPoolForTests, type PgPool } from "../../db/postgres.js";
import { createWorker, resolveWorkerInvitation, validateWorkerMutation, WorkerMutationError } from "./workerMutationService.js";

const base = { firstName: " Ana ", lastName: " Pérez ", dni: "12.345.678", email: "ANA@EXAMPLE.COM", password: "segura12345", role: "TRABAJADOR", hasFixedCompensation: false, fixedCompensationAmount: null, fixedCompensationFrequency: null };
test("normaliza DNI/correo y exige las reglas públicas de contraseña", async () => {
  const input = validateWorkerMutation(base, true);
  assert.equal(input.dni, "12345678"); assert.equal(input.email, "ana@example.com");
  assert.throws(() => validateWorkerMutation({ ...base, password: "demasiadocorta" }, true), WorkerMutationError);
  const hash = await hashPassword(input.password!); assert.notEqual(hash, input.password); assert.equal(await verifyPassword(input.password!, hash), true);
});
test("FIXED y VARIABLE respetan la invariantes de monto", () => {
  assert.equal(validateWorkerMutation({ ...base, hasFixedCompensation: true, fixedCompensationAmount: 0, fixedCompensationFrequency: "MONTHLY", currencyCode: "ARS" }, true).fixedCompensationAmount, 0);
  assert.throws(() => validateWorkerMutation({ ...base, hasFixedCompensation: true, fixedCompensationAmount: -1, fixedCompensationFrequency: "MONTHLY", currencyCode: "ARS" }, true));
  assert.throws(() => validateWorkerMutation({ ...base, hasFixedCompensation: false, fixedCompensationAmount: 1, fixedCompensationFrequency: null }, true));
});
test("roles operativos no heredan privilegios administrativos de Director", () => {
  for (const role of ["TRABAJADOR", "INSTRUCTOR"] as const) {
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("workers.manage" as never));
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("club:manage" as never));
  }
});
test("SQL contiene auditoría previa, gate, compatibilidad y verificaciones", () => {
  const sql=readFileSync(new URL("../../../../../docs/dbeaver-workers-payment-and-roles.sql",import.meta.url),"utf8");
  assert.match(sql,/AUDITORÍA \(solo lectura\)/); assert.match(sql,/AUDIT_GATE_FAILED/); assert.match(sql,/COMPATIBILIDAD TEMPORAL/);
  assert.match(sql,/upper\(role\.code\) in \('TRABAJADOR', 'INSTRUCTOR'\)/); assert.match(sql,/club:manage/);
  assert.match(sql,/lower\(existing\.code\) = lower\(value\.code\)/);
  const executableSql = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql,/on conflict\s*\(club_id,\s*code\)/i);
});

const actor = { userId: "10000000-0000-4000-8000-000000000001", membershipId: "10000000-0000-4000-8000-000000000002", clubId: "10000000-0000-4000-8000-000000000003" };
const existingBody = { ...base, password: undefined };
const mockPool = (respond: (sql: string, params: unknown[]) => Record<string, unknown>[]) => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = { query: async (sql: string, params: unknown[] = []) => { statements.push({ sql, params }); return { rows: respond(sql, params) }; }, release: () => undefined };
  return { pool: { ...client, connect: async () => client, end: async () => undefined } as PgPool, statements };
};

test("un email existente en otro club sólo crea una invitación tenant-scoped", async () => {
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

test("una invitación expirada no activa membresía ni permisos", async () => {
  const { pool, statements } = mockPool((sql) => sql.includes("from miclub.worker_invitations") ? [{ id: "40000000-0000-4000-8000-000000000001", club_id: actor.clubId, user_id: actor.userId, role_id: "30000000-0000-4000-8000-000000000001", invited_by: actor.userId, expires_at: new Date(Date.now() - 1_000), status: "pending", worker_data: existingBody }] : []);
  setPostgresPoolForTests(pool);
  try {
    await assert.rejects(resolveWorkerInvitation(actor.userId, "token-expirado", "accept"), WorkerMutationError);
    assert.ok(statements.some(({ sql }) => sql.includes("status='expired'")));
    assert.ok(!statements.some(({ sql }) => sql.includes("insert into miclub.user_club_memberships")));
  } finally { setPostgresPoolForTests(undefined); }
});

test("el rechazo consume la invitación y audita sin crear membership", async () => {
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
