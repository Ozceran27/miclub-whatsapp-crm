import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrationManifest } from "./migrationManifest.js";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const provisioningPath = path.join(root, "apps/api/db/provision/202608150001_runtime_roles.sql");
const defaultBackup = path.join(root, "apps/api/data/db/dump-miclub_gestion-202608151942.txt");
const controlUrl = process.env.MIGRATION_GATE_DATABASE_URL;

if (!controlUrl) {
  throw new Error("MIGRATION_GATE_DATABASE_URL es obligatoria y debe apuntar a una base de mantenimiento con un usuario superuser");
}

const control = new pg.Pool({ connectionString: controlUrl });

function databaseUrl(database: string): string {
  const value = new URL(controlUrl!);
  value.pathname = `/${database}`;
  return value.toString();
}

async function runSqlFile(url: string, filename: string): Promise<void> {
  await execute(process.env.PSQL ?? "psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", url, "--file", filename], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function runMigrations(url: string): Promise<void> {
  await execute(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "apps/api/src/scripts/runMigrations.ts"], {
    cwd: root,
    env: { ...process.env, ADMIN_DATABASE_URL: url, PGADMINROLE: "" },
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function assertCatalog(url: string): Promise<void> {
  const db = new pg.Pool({ connectionString: url });
  try {
    const ledger = await db.query<{ name: string; checksum: string }>(
      "select name, checksum from public.miclub_schema_migrations order by applied_at, name",
    );
    assert.deepEqual(
      new Map(ledger.rows.map((row) => [row.name, row.checksum])),
      new Map(migrationManifest.map((entry) => [path.basename(entry.path), entry.sha256])),
      "el ledger debe coincidir exactamente con migrationManifest",
    );

    const objects = await db.query<{ kind: string; name: string }>(`
      select 'table', table_name from information_schema.tables where table_schema='miclub' and table_name in ('clubs','users','movements','features')
      union all select 'enum', typname from pg_type join pg_namespace n on n.oid=typnamespace where n.nspname='miclub' and typtype='e' and typname='entity_status'
      union all select 'view', table_name from information_schema.views where table_schema='miclub' and table_name='v_opening_balance_reconciliation'
      union all select 'function', proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='miclub' and proname='next_tenant_sequence'
      union all select 'constraint', conname from pg_constraint join pg_namespace n on n.oid=connamespace where n.nspname='miclub' and conname='activities_sector_tenant_fkey'
      union all select 'index', indexname from pg_indexes where schemaname='miclub' and indexname='activities_sector_club_fkey_idx'
    `);
    for (const expected of ["table:clubs", "table:users", "table:movements", "table:features", "enum:entity_status", "view:v_opening_balance_reconciliation", "function:next_tenant_sequence", "constraint:activities_sector_tenant_fkey", "index:activities_sector_club_fkey_idx"]) {
      assert.ok(objects.rows.some((row) => `${row.kind}:${row.name}` === expected), `falta ${expected}`);
    }

    const rls = await db.query<{ relname: string }>("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='miclub' and relname in ('people','movements','activities') and relrowsecurity and relforcerowsecurity");
    assert.equal(rls.rows.length, 3, "las tablas tenant prioritarias deben forzar RLS");
    const grants = await db.query<{ admin: boolean; runtime: boolean }>("select has_schema_privilege('miclub_admin','miclub','USAGE') admin, has_table_privilege('miclub_runtime','miclub.movements','SELECT') runtime");
    assert.deepEqual(grants.rows[0], { admin: true, runtime: true });
    const seeds = await db.query<{ currencies: string; features: string; plans: string; icons: string }>("select (select count(*) from miclub.currencies)::text currencies, (select count(*) from miclub.features)::text features, (select count(*) from miclub.plans)::text plans, (select count(*) from miclub.activity_icon_catalog)::text icons");
    for (const [seed, count] of Object.entries(seeds.rows[0])) assert.ok(Number(count) > 0, `seed global vacío: ${seed}`);
    const legacy = await db.query("select 1 from miclub.clubs where lower(code)='legacy'");
    assert.equal(legacy.rows.length, 0, "ni el bootstrap vacío ni el backup pre-reset deben dejar un club legacy artificial");
  } finally {
    await db.end();
  }
}

async function scenario(kind: "empty" | "restore", backup?: string): Promise<void> {
  const name = `miclub_gate_${kind}_${randomBytes(6).toString("hex")}`;
  await control.query(`create database ${name}`);
  const url = databaseUrl(name);
  try {
    if (backup) await runSqlFile(url, backup);
    await runMigrations(url);
    await assertCatalog(url);
    console.log(`OK: ${kind}`);
  } finally {
    await control.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()", [name]);
    await control.query(`drop database if exists ${name}`);
  }
}

try {
  await runSqlFile(controlUrl, provisioningPath);
  await scenario("empty");
  const backup = process.env.MIGRATION_GATE_BACKUP ?? defaultBackup;
  await access(backup);
  await scenario("restore", backup);
} finally {
  await control.end();
}
