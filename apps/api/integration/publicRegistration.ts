import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { CLUB_ROLE_DEFINITIONS } from "@miclub/shared";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const controlUrl = process.env.MIGRATION_GATE_DATABASE_URL;
if (!controlUrl) throw new Error("MIGRATION_GATE_DATABASE_URL debe apuntar a una base de mantenimiento PostgreSQL con un superusuario");

const databaseName = `miclub_registration_it_${randomBytes(6).toString("hex")}`;
const databaseUrl = (name: string) => { const url = new URL(controlUrl); url.pathname = `/${name}`; return url.toString(); };
const disposableUrl = databaseUrl(databaseName);
const control = new pg.Pool({ connectionString: controlUrl });
let database: pg.Pool | undefined;
let server: Server | undefined;

const registration = {
  firstName: "Ada", lastName: "Integración", dni: "30123456", phone: "1123456789",
  email: "public-registration@integration.invalid", password: "Password-12345", club: { name: "Club Primer E2E" },
};

const postRegistration = async (base: string): Promise<number> => {
  const response = await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(registration),
  });
  return response.status;
};

const tenantCounts = async () => (await database!.query<Record<string, string>>(`
  select
    (select count(*) from miclub.clubs)::text clubs,
    (select count(*) from miclub.users)::text users,
    (select count(*) from miclub.people)::text people,
    (select count(*) from miclub.club_subscriptions)::text subscriptions,
    (select count(*) from miclub.club_onboarding)::text onboarding,
    (select count(*) from miclub.roles where club_id is not null)::text roles,
    (select count(*) from miclub.user_club_memberships)::text memberships,
    (select count(*) from miclub.employees)::text employees,
    (select count(*) from miclub.payment_methods where club_id is not null)::text payment_methods,
    (select count(*) from miclub.sectors)::text sectors
`)).rows[0];

const main = async () => {
  await control.query(`create database ${databaseName}`);
  await execute(process.env.PSQL ?? "psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", controlUrl, "--file", "apps/api/db/provision/202608150001_runtime_roles.sql"], { cwd: root });
  await execute(process.execPath, ["node_modules/tsx/dist/cli.mjs", "apps/api/src/scripts/runMigrations.ts"], {
    cwd: root, env: { ...process.env, ADMIN_DATABASE_URL: disposableUrl, PGADMINROLE: "" }, maxBuffer: 32 * 1024 * 1024,
  });
  database = new pg.Pool({ connectionString: disposableUrl });
  assert.equal(Number((await tenantCounts()).clubs), 0, "el schema recién migrado debe comenzar sin clubes");

  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_URL: disposableUrl, ADMIN_DATABASE_URL: disposableUrl,
    AUTH_ENABLED: "true", PUBLIC_REGISTRATION_ENABLED: "true",
    SESSION_SECRET: "registration-integration-secret-at-least-32-characters",
    DATA_SOURCE: "postgres", CRM_SOURCE: "postgres",
  });
  const { app } = await import("../src/index.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  // Force provisioning to fail after the club INSERT and prove the surrounding
  // transaction leaves no partial tenant behind.
  await database.query("update miclub.plans set catalog_status='inactive' where code='FREE'");
  assert.equal(await postRegistration(base), 500);
  assert.ok(Object.values(await tenantCounts()).every((count) => Number(count) === 0), "un alta fallida debe revertir todas las entidades tenant");
  await database.query("update miclub.plans set catalog_status='catalog' where code='FREE'");

  assert.equal(await postRegistration(base), 201);
  const state = await database.query<{
    first_name: string; last_name: string; email: string; club_name: string; plan_code: string;
    onboarding_status: string; role_code: string; membership_status: string; position: string;
    role_count: string; payment_methods: string[]; sectors: string[];
  }>(`
    select p.first_name,p.last_name,u.email,c.name club_name,s.plan_code,
           o.status onboarding_status,r.code role_code,m.status membership_status,e.position,
           (select count(*)::text from miclub.roles rr where rr.club_id=c.id) role_count,
           (select array_agg(pm.name order by pm.name) from miclub.payment_methods pm where pm.club_id=c.id) payment_methods,
           (select array_agg(sec.name order by sec.name) from miclub.sectors sec where sec.club_id=c.id) sectors
      from miclub.clubs c
      join miclub.club_subscriptions s on s.club_id=c.id
      join miclub.club_onboarding o on o.club_id=c.id
      join miclub.people p on p.club_id=c.id
      join miclub.users u on u.id=p.user_id
      join miclub.user_club_memberships m on m.club_id=c.id and m.user_id=u.id
      join miclub.roles r on r.id=m.role_id
      join miclub.employees e on e.club_id=c.id and e.person_id=p.id and e.membership_id=m.id
  `);
  assert.equal(state.rows.length, 1);
  const { payment_methods: paymentMethods, sectors, ...provisioned } = state.rows[0];
  assert.deepEqual(provisioned, {
    first_name: registration.firstName, last_name: registration.lastName, email: registration.email,
    club_name: registration.club.name, plan_code: "FREE", onboarding_status: "NOT_STARTED",
    role_code: "DIRECTOR", membership_status: "active", position: "Director",
    role_count: String(Object.keys(CLUB_ROLE_DEFINITIONS).length),
  });
  assert.deepEqual(new Set(paymentMethods), new Set(["Efectivo", "Transferencia"]));
  assert.deepEqual(new Set(sectors), new Set(["Administración", "Tesorería", "Áreas Comunes"]));
  console.warn("OK: POST /auth/register aprovisiona el tenant completo y atómico sobre schema vacío");
};

try { await main(); }
finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  const { closePostgresPool, closePostgresAdminPool } = await import("../src/db/postgres.js");
  await closePostgresPool().catch(() => undefined); await closePostgresAdminPool().catch(() => undefined);
  await database?.end().catch(() => undefined);
  await control.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()", [databaseName]).catch(() => undefined);
  await control.query(`drop database if exists ${databaseName}`).catch(() => undefined);
  await control.end();
}
