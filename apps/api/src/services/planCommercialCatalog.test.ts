import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../db/migrations/202608160001_commercial_plan_taxonomy.sql", import.meta.url);

test("el catálogo declara un plan gratuito y tres pagos sin inferir precio del estado", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS commercial_class text/);
  assert.match(sql, /commercial_class IN \('non_commercial', 'free', 'paid'\)/);
  assert.match(sql, /\('FREE', 'Free', 'catalog', false, 'free'\)/);
  for (const code of ["GROWTH", "PROFESSIONAL", "ENTERPRISE"]) {
    assert.match(sql, new RegExp(`\\('${code}', '[^']+', 'catalog', false, 'paid'\\)`));
  }
  assert.match(sql, /free_count <> 1 OR paid_count <> 3/);
  assert.doesNotMatch(sql, /DELETE FROM miclub\.plans/, "los reintentos no deben destruir planes ni referencias");
  assert.doesNotMatch(sql, /CREATE TABLE[\s\S]*(payment|invoice|charge)|ADD COLUMN (price|amount|currency)/i,
    "la migración no debe implementar precios ni cobros");
});

test("DEVELOPMENT queda reservado a testing y fuera del catálogo comercial", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /DEVELOPMENT[\s\S]*internal testing plan excluded from the commercial catalog/);
  assert.match(sql, /catalog_status = 'development'[\s\S]*commercial_class = 'non_commercial'[\s\S]*code = 'DEVELOPMENT'/);
  assert.match(sql, /code = 'DEVELOPMENT' AND catalog_status = 'catalog'/);
});
