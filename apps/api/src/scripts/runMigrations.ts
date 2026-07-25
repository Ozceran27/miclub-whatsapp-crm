import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresPool, closePostgresPool } from "../db/postgres.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
const pool = await getPostgresPool();
await pool.query(`create table if not exists public.miclub_schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
for (const name of (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort()) {
  const sql = await readFile(path.join(migrationsDir, name), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await pool.query<{ checksum: string }>("select checksum from public.miclub_schema_migrations where name=$1", [name]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) throw new Error(`Checksum modificado para migración ya aplicada: ${name}`);
    continue;
  }
  await pool.query(sql);
  await pool.query("insert into public.miclub_schema_migrations(name, checksum) values ($1,$2)", [name, checksum]);
  console.log(`Aplicada ${name}`);
}
await closePostgresPool();
