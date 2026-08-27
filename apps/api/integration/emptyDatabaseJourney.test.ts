import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { test } from "node:test";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrationManifest } from "../src/scripts/migrationManifest.js";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const testDatabaseUrl = process.env.MICLUB_TEST_DATABASE_URL?.trim();
const missingDatabaseReason = "MICLUB_TEST_DATABASE_URL no está definida; se omite para no usar una base compartida o de producción";

const assertDedicatedTestUrl = (value: string): URL => {
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  assert.match(databaseName, /(?:^|[_-])test(?:$|[_-])/i, "MICLUB_TEST_DATABASE_URL debe nombrar explícitamente una base de test dedicada");
  assert.doesNotMatch(databaseName, /prod|production|miclub_gestion/i, "MICLUB_TEST_DATABASE_URL no puede identificar una base productiva o compartida");
  return url;
};

void test("recorre el alta del primer club sobre PostgreSQL migrado desde cero", {
  skip: testDatabaseUrl ? false : missingDatabaseReason,
  timeout: 180_000,
}, async () => {
  const controlUrl = assertDedicatedTestUrl(testDatabaseUrl!);
  const databaseName = `miclub_empty_journey_test_${randomBytes(6).toString("hex")}`;
  const disposable = new URL(controlUrl);
  disposable.pathname = `/${databaseName}`;
  const disposableUrl = disposable.toString();
  const control = new pg.Pool({ connectionString: controlUrl.toString(), max: 1 });
  let database: pg.Pool | undefined;
  let server: Server | undefined;

  const registration = {
    firstName: "Ada", lastName: "Aislada", dni: "30123456", phone: "1123456789",
    email: `first-club-${databaseName}@integration.invalid`, password: "Password-12345",
    club: { name: "Primer Club Aislado" },
  };

  try {
    await control.query(`create database ${databaseName}`);
    await execute(process.env.PSQL ?? "psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", disposableUrl, "--file", "apps/api/db/provision/202608150001_runtime_roles.sql"], { cwd: root });
    await execute(process.execPath, ["node_modules/tsx/dist/cli.mjs", "apps/api/src/scripts/runMigrations.ts"], {
      cwd: root,
      env: { ...process.env, ADMIN_DATABASE_URL: disposableUrl, PGADMINROLE: "" },
      maxBuffer: 32 * 1024 * 1024,
    });

    database = new pg.Pool({ connectionString: disposableUrl });
    const ledger = await database.query<{ name: string; checksum: string }>("select name, checksum from public.miclub_schema_migrations order by applied_at, name");
    assert.equal(ledger.rows.length, migrationManifest.length, "el ledger debe registrar todo el manifiesto real");
    assert.deepEqual(new Set(ledger.rows.map(({ name }) => name)), new Set(migrationManifest.map(({ path: entryPath }) => path.basename(entryPath))));
    assert.ok(ledger.rows.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)), "cada migración debe conservar su checksum");

    const initial = (await database.query<Record<string, string>>(`select
      (select count(*) from miclub.clubs)::text clubs,
      (select count(*) from miclub.users)::text users,
      (select count(*) from miclub.people)::text people,
      (select count(*) from miclub.movements)::text movements,
      (select count(*) from miclub.enrollments)::text enrollments,
      (select count(*) from miclub.activities)::text activities`)).rows[0];
    assert.ok(Object.values(initial).every((count) => Number(count) === 0), "la base nueva no debe contener datos tenant");

    const globals = (await database.query<Record<string, string>>(`select
      (select count(*) from miclub.category_catalog where is_active)::text categories,
      (select count(*) from miclub.roles where club_id is null)::text roles,
      (select count(*) from miclub.sector_templates where is_active)::text templates`)).rows[0];
    assert.ok(Object.values(globals).every((count) => Number(count) > 0), "los catálogos globales deben quedar disponibles sin crear tenants");

    Object.assign(process.env, {
      NODE_ENV: "test", DATABASE_URL: disposableUrl, ADMIN_DATABASE_URL: disposableUrl,
      AUTH_ENABLED: "true", PUBLIC_REGISTRATION_ENABLED: "true",
      SESSION_SECRET: "empty-database-integration-secret-at-least-32-characters",
      DATA_SOURCE: "postgres", CRM_SOURCE: "postgres",
    });
    const { app } = await import("../src/index.js");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (route: string, init: RequestInit = {}, cookie?: string) => {
      const response = await fetch(`${base}${route}`, { ...init, headers: { ...init.headers, ...(cookie ? { cookie } : {}) } });
      const body = response.status === 204 ? undefined : await response.json();
      return { response, body };
    };
    const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

    const health = await request("/api/db/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.postgresEnabled, true);

    const registered = await request("/auth/register", json(registration));
    assert.equal(registered.response.status, 201);
    const loggedIn = await request("/auth/login", json({ username: registration.email, password: registration.password }));
    assert.equal(loggedIn.response.status, 200);
    assert.equal(loggedIn.body.authenticated, true);
    const cookie = loggedIn.response.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie, "login debe emitir la cookie de sesión real");

    const me = await request("/auth/me", {}, cookie);
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.email, registration.email);

    const dashboard = await request("/api/dashboard/basic", {}, cookie);
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.body.total, 1);
    for (const [key, value] of Object.entries(dashboard.body.item as Record<string, unknown>)) {
      if (!["clubId", "updatedAt"].includes(key) && typeof value === "number") assert.equal(value, 0, `dashboard vacío: ${key}`);
    }
    const sectorsDashboard = await request("/api/sector-finance-summary", {}, cookie);
    assert.equal(sectorsDashboard.response.status, 200);
    assert.ok(sectorsDashboard.body.items.every((row: Record<string, unknown>) => ["totalIncome", "totalExpense", "balance", "settlementBalance", "totalProfitability", "currentMonthProfitability"].every((key) => Number(row[key] ?? 0) === 0)));

    const onboarding = await request("/api/onboarding", {}, cookie);
    assert.equal(onboarding.response.status, 200);
    assert.equal(onboarding.body.status, "NOT_STARTED");
    assert.equal(onboarding.body.movementCount, 0);
    assert.equal(onboarding.body.enrollmentCount, 0);
    assert.equal(onboarding.body.shouldShow, true, "el onboarding debe ser visible inmediatamente después del primer login");

    const navigation = await request("/api/modules/navigation", {}, cookie);
    assert.equal(navigation.response.status, 200, "la navegación debe responder tras registro, login y lectura del onboarding");
    assert.ok(Array.isArray(navigation.body.sectors));

    for (const route of ["/api/movement-categories", "/api/catalogs/roles", "/api/administration/sector-templates", "/templates"]) {
      const catalog = await request(route, {}, cookie);
      assert.equal(catalog.response.status, 200, `${route} debe estar disponible`);
      const items = Array.isArray(catalog.body) ? catalog.body : catalog.body.items;
      assert.ok(Array.isArray(items) && items.length > 0, `${route} debe exponer datos iniciales`);
    }

    // El onboarding debe poder crear entidades reales partiendo del tenant recién provisionado.
    const templateCatalog = await request("/api/administration/sector-templates", {}, cookie);
    assert.equal(templateCatalog.body.items.length, 30, "el runner debe instalar las 30 plantillas canónicas");
    assert.ok(templateCatalog.body.items.every((item: Record<string, unknown>) => typeof item.icon_key === "string" && item.icon_key.length > 0));
    const sectorCreated = await request("/api/administration/sectors", json({ templateId: templateCatalog.body.items[0].id, color: "#2563EB", status: "active" }), cookie);
    assert.equal(sectorCreated.response.status, 201);
    const workerCreated = await request("/api/administration/workers", json({ firstName: "Inés", lastName: "Instructora", dni: "32999888", email: `instructor-${databaseName}@integration.invalid`, password: "Instructor-12345", role: "INSTRUCTOR", sectorId: sectorCreated.body.id, paymentMode: "VARIABLE" }), cookie);
    assert.equal(workerCreated.response.status, 201);
    const instructorCatalog = await request("/api/instructors", {}, cookie);
    assert.ok(instructorCatalog.body.length > 0);
    const activityCreated = await request("/api/activities", json({ sectorId: sectorCreated.body.id, instructorId: instructorCatalog.body[0].id, managerPersonId: null, name: "Actividad inicial", iconKey: "other", color: "#2563EB", enrollmentFee: 1000, clubCommissionPercent: 25, instructorCommissionPercent: 75, status: "active", notes: "Término económico VARIABLE" }), cookie);
    assert.equal(activityCreated.response.status, 201);
    const persistedEntities = await database.query<{ sectors: string; workers: string; activities: string }>(`select
      (select count(*) from miclub.sectors where club_id=(select id from miclub.clubs where name=$1) and archived_at is null)::text sectors,
      (select count(*) from miclub.employees where club_id=(select id from miclub.clubs where name=$1) and archived_at is null)::text workers,
      (select count(*) from miclub.activities where club_id=(select id from miclub.clubs where name=$1) and archived_at is null)::text activities`, [registration.club.name]);
    assert.ok(Number(persistedEntities.rows[0].sectors) >= 4);
    assert.ok(Number(persistedEntities.rows[0].workers) >= 2);
    assert.equal(Number(persistedEntities.rows[0].activities), 1);

    const logout = await request("/auth/logout", json({}), cookie);
    assert.equal(logout.response.status, 200);
    assert.equal(logout.body.authenticated, false);
    const afterLogout = await request("/auth/me", {}, cookie);
    assert.equal(afterLogout.response.status, 401);
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    const { closePostgresPool, closePostgresAdminPool } = await import("../src/db/postgres.js");
    await closePostgresPool().catch(() => undefined);
    await closePostgresAdminPool().catch(() => undefined);
    await database?.end().catch(() => undefined);
    await control.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()", [databaseName]).catch(() => undefined);
    await control.query(`drop database if exists ${databaseName}`).catch(() => undefined);
    await control.end();
  }
});
