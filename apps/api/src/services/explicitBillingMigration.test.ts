import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl=new URL("../../db/migrations/202609010004_explicit_billing_modes.sql",import.meta.url);

test("la migración manual usa el contexto tenant existente y no depende de funciones auxiliares",async()=>{
 const sql=await readFile(migrationUrl,"utf8");
 assert.match(sql,/NULLIF\(current_setting\('app\.club_id', true\), ''\)::uuid/g);
 assert.doesNotMatch(sql,/miclub\.current_club_id\s*\(/);
});

test("la migración se puede reintentar tras una ejecución parcial en DBeaver",async()=>{
 const sql=await readFile(migrationUrl,"utf8");
 assert.match(sql,/ADD COLUMN IF NOT EXISTS selection_mode/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS miclub\.billing_payment_confirmations/);
 assert.match(sql,/DROP POLICY IF EXISTS billing_payment_confirmations_tenant_isolation/);
});
