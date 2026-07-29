import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresPool, closePostgresPool } from "../db/postgres.js";
import { migrationManifest } from "./migrationManifest.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

const discoveredPaths = [
  ...(await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")),
  ...(await readdir(path.join(migrationsDir, "multitenant")))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => `multitenant/${name}`),
];
const manifestPaths = migrationManifest.map((entry) => entry.path);
const migrationNames = manifestPaths.map((migrationPath) => path.basename(migrationPath));

const duplicates = migrationNames.filter((name, index) => migrationNames.indexOf(name) !== index);
if (duplicates.length > 0) throw new Error(`Nombres de migración repetidos: ${[...new Set(duplicates)].join(", ")}`);

const missing = manifestPaths.filter((migrationPath) => !discoveredPaths.includes(migrationPath));
const unlisted = discoveredPaths.filter((migrationPath) => !manifestPaths.includes(migrationPath));
if (missing.length > 0 || unlisted.length > 0) {
  throw new Error(`Manifiesto de migraciones inválido. Ausentes: ${missing.join(", ") || "ninguna"}. SQL no incluidos: ${unlisted.join(", ") || "ninguno"}`);
}

const migrations = await Promise.all(migrationManifest.map(async (migration) => {
  const sql = await readFile(path.join(migrationsDir, migration.path), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  if (checksum !== migration.sha256) throw new Error(`Checksum no coincide con el manifiesto: ${migration.path}`);
  return { ...migration, name: path.basename(migration.path), sql, checksum };
}));

const pool = await getPostgresPool();
await pool.query(`create table if not exists public.miclub_schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
for (const migration of migrations) {
  const existing = await pool.query<{ checksum: string }>("select checksum from public.miclub_schema_migrations where name=$1", [migration.name]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== migration.checksum) throw new Error(`Checksum modificado para migración ya aplicada: ${migration.name}`);
    continue;
  }
  await pool.query(migration.sql);
  await pool.query("insert into public.miclub_schema_migrations(name, checksum) values ($1,$2)", [migration.name, migration.checksum]);
  console.log(`Aplicada ${migration.path}`);
}
await closePostgresPool();
