import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresAdminPool, closePostgresAdminPool } from "../db/postgres.js";
import { canonicalizeMigrationSql, cleanInstallBaseline, hasOpenTransaction, installationManifest, migrationManifest, validateMigrationGraph, type MigrationLedgerEntry } from "./migrationManifest.js";
import { prepareMigrationSql } from "./migrationCompatibility.js";
import { assertMigrationLedgerCompatible } from "./migrationPreflight.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

const discoveredPaths = [
  ...(await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")),
  ...(await readdir(path.join(migrationsDir, "multitenant")))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => `multitenant/${name}`),
];
const manifestPaths = migrationManifest.map((entry) => entry.path);
const migrationNames = manifestPaths.map((migrationPath) => path.basename(migrationPath));

const graphErrors = validateMigrationGraph(migrationManifest);
if (graphErrors.length > 0) throw new Error(`Grafo de migraciones inválido:\n${graphErrors.join("\n")}`);

const duplicates = migrationNames.filter((name, index) => migrationNames.indexOf(name) !== index);
if (duplicates.length > 0) throw new Error(`Nombres de migración repetidos: ${[...new Set(duplicates)].join(", ")}`);

const missing = manifestPaths.filter((migrationPath) => !discoveredPaths.includes(migrationPath));
const unlisted = discoveredPaths.filter((migrationPath) => !manifestPaths.includes(migrationPath));
if (missing.length > 0 || unlisted.length > 0) {
  throw new Error(`Manifiesto de migraciones inválido. Ausentes: ${missing.join(", ") || "ninguna"}. SQL no incluidos: ${unlisted.join(", ") || "ninguno"}`);
}

const migrations = await Promise.all([...migrationManifest, cleanInstallBaseline].map(async (migration) => {
  const sql = await readFile(path.join(migrationsDir, migration.path), "utf8");
  const canonicalSql = canonicalizeMigrationSql(sql);
  const checksum = createHash("sha256").update(canonicalSql).digest("hex");
  if (checksum !== migration.sha256) throw new Error(`Checksum no coincide con el manifiesto: ${migration.path}`);
  if (hasOpenTransaction(canonicalSql)) throw new Error(`La migración deja una transacción abierta: ${migration.path}`);
  return { ...migration, name: path.basename(migration.path), sql: canonicalSql, checksum };
}));

const pool = await getPostgresAdminPool();
const client = await pool.connect();
try {
  await client.query("select pg_advisory_lock(817320260908::bigint)");
  await assertMigrationLedgerCompatible(client);
  await client.query(`create table if not exists public.miclub_schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  const ledger = (await client.query<MigrationLedgerEntry>('select name, checksum from public.miclub_schema_migrations')).rows;
  const selected = installationManifest(ledger);
  for (const entry of selected) {
    const migration = migrations.find(candidate => candidate.path === entry.path)!;
    if (ledger.some(row => row.name === migration.name)) continue;
    try {
      await client.query('BEGIN');
      // The runner owns the transaction, including its ledger record. Historical
      // files retain their immutable standalone wrappers for manual execution.
      const sql = prepareMigrationSql(migration.name, migration.sql)
        .replace(/^\s*(?:BEGIN|START TRANSACTION|COMMIT|ROLLBACK);[^\S\n]*(?:--[^\n]*)?$/gmi, '');
      await client.query(sql);
      await client.query("insert into public.miclub_schema_migrations(name, checksum) values ($1,$2)", [migration.name, migration.checksum]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Falló la migración ${migration.path}: ${detail}`, { cause: error });
    }
    process.stdout.write(`Aplicada ${migration.path}\n`);
  }
} finally {
  await client.query("select pg_advisory_unlock(817320260908::bigint)").catch(() => undefined);
  client.release();
  await closePostgresAdminPool();
}
