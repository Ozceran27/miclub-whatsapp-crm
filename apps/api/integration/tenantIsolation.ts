import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const controlUrl = process.env.MIGRATION_GATE_DATABASE_URL;
if (!controlUrl) throw new Error("MIGRATION_GATE_DATABASE_URL debe apuntar a una base de mantenimiento PostgreSQL con un superusuario");

const databaseName = `miclub_tenant_it_${randomBytes(6).toString("hex")}`;
const databaseUrl = (name: string) => { const url = new URL(controlUrl); url.pathname = `/${name}`; return url.toString(); };
const disposableUrl = databaseUrl(databaseName);
const control = new pg.Pool({ connectionString: controlUrl });
let admin: pg.Pool | undefined;
let server: Server | undefined;

type Json = Record<string, unknown>;
type ResponseResult = { status: number; body: Json; headers: Headers };

const request = async (base: string, method: string, route: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<ResponseResult> => {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Json : {}, headers: response.headers };
};

const registration = (suffix: string, club: string, dni: string) => ({
  firstName: `Usuario ${suffix}`, lastName: "Integración", dni, phone: "1123456789",
  email: `tenant-${suffix.toLowerCase()}@integration.invalid`, password: `Password-${suffix}-12345`, club: { name: club },
});

const snapshotClub = async (clubId: string) => {
  const tables = ["activities", "sectors", "people", "movements", "enrollments", "import_batches"] as const;
  return Promise.all(tables.map(async (table) => ({
    table,
    rows: (await admin!.query<{ rows: unknown }>(`select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) rows from miclub.${table} t where club_id=$1`, [clubId])).rows[0].rows,
  })));
};

const main = async () => {
  await control.query(`create database ${databaseName}`);
  await execute(process.env.PSQL ?? "psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", controlUrl, "--file", "apps/api/db/provision/202608150001_runtime_roles.sql"], { cwd: root });
  await execute(process.execPath, ["node_modules/tsx/dist/cli.mjs", "apps/api/src/scripts/runMigrations.ts"], {
    cwd: root, env: { ...process.env, ADMIN_DATABASE_URL: disposableUrl, PGADMINROLE: "" }, maxBuffer: 32 * 1024 * 1024,
  });
  admin = new pg.Pool({ connectionString: disposableUrl });

  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_URL: disposableUrl, ADMIN_DATABASE_URL: disposableUrl,
    AUTH_ENABLED: "true", PUBLIC_REGISTRATION_ENABLED: "true", SESSION_SECRET: "tenant-integration-secret-at-least-32-characters",
    DATA_SOURCE: "postgres", CRM_SOURCE: "postgres",
  });
  const { app } = await import("../src/index.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const userA = registration("A", "Club A", "30111222");
  const userB = registration("B", "Club B", "30222333");
  assert.equal((await request(base, "POST", "/auth/register", userA)).status, 201);
  assert.equal((await request(base, "POST", "/auth/register", userB)).status, 201);

  const clubs = await admin.query<{ id: string; name: string }>("select id,name from miclub.clubs where name in ('Club A','Club B') order by name");
  assert.equal(clubs.rows.length, 2);
  const clubA = clubs.rows[0].id, clubB = clubs.rows[1].id;
  const ids = { sector: randomUUID(), person: randomUUID(), instructor: randomUUID(), activity: randomUUID(), movement: randomUUID(), enrollment: randomUUID(), import: randomUUID() };
  await admin.query("select set_config('app.club_id',$1,false)", [clubB]);
  await admin.query("insert into miclub.people(id,club_id,first_name,last_name,dni,email) values($1,$2,'Responsable','B','30999888','responsable-b@integration.invalid')", [ids.person, clubB]);
  await admin.query("insert into miclub.person_kind_links(person_id,kind,club_id) values($1,'instructor',$2)", [ids.person, clubB]);
  await admin.query("insert into miclub.instructors(id,person_id,club_id,display_name) values($1,$2,$3,'Instructor B')", [ids.instructor, ids.person, clubB]);
  await admin.query("insert into miclub.sectors(id,club_id,code,name,status,operational_status,uses_enrollments,uses_activities) values($1,$2,'B-SEC','Sector B','active','activa',true,true)", [ids.sector, clubB]);
  await admin.query("insert into miclub.activities(id,club_id,sector_id,manager_person_id,instructor_id,code,name,status) values($1,$2,$3,$4,$5,'B-ACT','Actividad B','activa')", [ids.activity, clubB, ids.sector, ids.person, ids.instructor]);
  await admin.query("insert into miclub.movements(id,club_id,movement_type,sector_id,activity_id,concept,counterparty_text,amount,sequence_number) values($1,$2,'INGRESOS',$3,$4,'Movimiento B','Club B',100,1)", [ids.movement, clubB, ids.sector, ids.activity]);
  await admin.query("insert into miclub.enrollments(id,club_id,person_id,activity_id,fee_amount,enrollment_date,sequence_number) values($1,$2,$3,$4,100,current_date,1)", [ids.enrollment, clubB, ids.person, ids.activity]);
  await admin.query("insert into miclub.import_batches(id,club_id,source,source_file,status,uploaded_by,operation_type) select $1,$2,'xlsx','club-b.xlsx','dry_run',u.id,'dry_run' from miclub.app_users u where lower(u.email)=lower($3)", [ids.import, clubB, userB.email]);

  const login = await request(base, "POST", "/auth/login", { username: userA.email, password: userA.password });
  assert.equal(login.status, 200, "Usuario A debe autenticarse por la superficie HTTP real");
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0]; assert.ok(cookie);
  assert.equal((login.body.user as Json).clubId, clubA);

  const before = await snapshotClub(clubB);
  const safe = async (method: string, route: string, body?: unknown, headers?: Record<string, string>) => {
    const response = await request(base, method, route, body, cookie, headers);
    assert.ok([403, 404, 409].includes(response.status), `${method} ${route} devolvió ${response.status}; se esperaba 403/404/409`);
  };

  for (const route of [`/api/actividades/${ids.activity}`, `/api/sectores/${ids.sector}`, `/api/trabajadores/${ids.person}`, `/api/movimientos/${ids.movement}`, `/api/inscripciones/${ids.enrollment}`, `/api/migration/uploads/${ids.import}`]) await safe("GET", route);
  const stale = "2026-01-01T00:00:00.000Z";
  await safe("POST", "/api/activities", { sectorId: ids.sector, name: "Ataque", clubCommissionPercent: 0, status: "inactive" });
  await safe("PATCH", `/api/activities/${ids.activity}`, { updatedAt: stale, sectorId: ids.sector, name: "Alterada", clubCommissionPercent: 0, status: "inactive" });
  await safe("POST", `/api/activities/${ids.activity}/archive`, { updatedAt: stale });
  await safe("PATCH", `/api/sectors/${ids.sector}`, { updatedAt: stale, name: "Alterado" });
  await safe("POST", `/api/sectors/${ids.sector}/archive`, { updatedAt: stale });
  await safe("PUT", `/api/administration/workers/${ids.person}`, { firstName: "Alterado", lastName: "B", dni: "30999888", phone: "1122334455", kinds: ["instructor"] });
  await safe("DELETE", `/api/administration/workers/${ids.person}`);
  await safe("PATCH", `/api/movements/${ids.movement}`, { updatedAt: stale, movementDate: "2026-01-01", movementType: "INGRESOS", categoryId: randomUUID(), sectorId: ids.sector, activityId: ids.activity, concept: "Ataque", counterpartyText: "B", amount: 1, paymentMethodId: randomUUID() });
  await safe("POST", `/api/movements/${ids.movement}/void`, { updatedAt: stale, reason: "Ataque" });
  await safe("POST", "/api/inscripciones", { personId: ids.person, activityId: ids.activity, feeAmount: 1, status: "al_dia", enrollmentDate: "2026-01-01" });
  await safe("PATCH", `/api/inscripciones/${ids.enrollment}`, { status: "baja", updatedAt: stale });
  await safe("POST", `/api/inscripciones/${ids.enrollment}/archive`, { updatedAt: stale });
  await safe("DELETE", `/api/inscripciones/${ids.enrollment}`);
  await safe("POST", "/api/movements", { movementDate: "2026-01-01", movementType: "INGRESOS", categoryId: randomUUID(), sectorId: ids.sector, activityId: ids.activity, concept: "Ataque", counterpartyText: "B", amount: 1, paymentMethodId: randomUUID() }, { "idempotency-key": randomUUID() });
  await safe("PATCH", `/api/migration/uploads/${ids.import}`, { status: "completed" });
  await safe("POST", `/api/migration/uploads/${ids.import}/archive`, {});
  await safe("DELETE", `/api/migration/uploads/${ids.import}`);

  const form = new FormData();
  const template = await readFile(path.join(root, "apps/api/data/db/Modelo_Import_miClub.xlsx"));
  form.set("file", new Blob([template], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Modelo_Import_miClub.xlsx");
  form.set("dryRunOfBatchId", ids.import);
  const importResponse = await fetch(`${base}/api/migration/uploads`, { method: "POST", headers: { cookie, "x-import-operation": "apply" }, body: form });
  assert.ok([403, 404, 409].includes(importResponse.status), `apply import ajeno devolvió ${importResponse.status}`);

  assert.deepEqual(await snapshotClub(clubB), before, "ninguna fila de Club B puede cambiar");
  const rlsSql = await readFile(path.join(root, "apps/api/db/tests/runtime_rls_negative.sql"), "utf8");
  await admin.query(rlsSql);
  console.log("OK: aislamiento HTTP Club A -> Club B y runtime RLS negativo");
};

try { await main(); }
finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  const { closePostgresPool, closePostgresAdminPool } = await import("../src/db/postgres.js");
  await closePostgresPool().catch(() => undefined); await closePostgresAdminPool().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  await control.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()", [databaseName]).catch(() => undefined);
  await control.query(`drop database if exists ${databaseName}`).catch(() => undefined);
  await control.end();
}
