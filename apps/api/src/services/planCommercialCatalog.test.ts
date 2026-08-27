import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../db/migrations/202608160001_commercial_plan_taxonomy.sql", import.meta.url);

test("el catálogo declara un plan gratuito y tres pagos sin inferir precio del estado", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS commercial_class text/);
  assert.match(sql, /commercial_class IN \('non_commercial',\s*'free',\s*'paid'\)/);
  assert.match(sql, /\('FREE',\s*'Free',\s*'catalog',\s*false,\s*'free'\)/);
  for (const code of ["SOCIAL", "COMPLEX", "CLUB"]) {
    assert.match(sql, new RegExp(`\\('${code}',\\s*'[^']+',\\s*'catalog',\\s*false,\\s*'paid'\\)`));
  }
  assert.match(sql, /commercial_class='free'\)<>1[\s\S]*commercial_class='paid'\)<>3/);
  assert.match(sql, /UPDATE miclub\.club_subscriptions[\s\S]*DELETE FROM miclub\.plans/,
    "primero debe migrar las referencias y recién después retirar los códigos anteriores");
  assert.doesNotMatch(sql, /CREATE TABLE[\s\S]*(payment|invoice|charge)|ADD COLUMN (price|amount|currency)/i,
    "la migración no debe implementar precios ni cobros");
});

test("los nombres solicitados son códigos canónicos y todos los pagos habilitan migración",async()=>{
 const sql=await readFile(migrationUrl,"utf8");
 assert.match(sql,/canonical persisted codes \(not aliases/);
 assert.match(sql,/plan\.code IN \('SOCIAL','COMPLEX','CLUB'\)/);
 assert.match(sql,/plan_code='FREE' AND feature_code='DATA_MIGRATION'/);
});

test("DEVELOPMENT queda reservado a testing y fuera del catálogo comercial", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /DEVELOPMENT[\s\S]*non_commercial/);
  assert.match(sql, /catalog_status='development'[\s\S]*commercial_class='non_commercial'[\s\S]*code='DEVELOPMENT'/);
  assert.match(sql, /code IN \('STARTER','GROWTH','PROFESSIONAL','ENTERPRISE'\)/);
});
