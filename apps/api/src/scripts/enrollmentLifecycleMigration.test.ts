import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../db/migrations/202608180001_enrollment_operational_lifecycle.sql", import.meta.url);
const manual = new URL("../../../../docs/dbeaver/18_enrollment_operational_lifecycle_manual.sql", import.meta.url);

test("el ciclo no reintroduce last_payment_at ambiguo en instalaciones legacy", async()=>{
  const sql=await readFile(migration,"utf8");
  assert.doesNotMatch(sql.replace(/--.*$/gm,""),/select\s+e\.\*/i);
  assert.match(sql,/payment_last_payment_at/);
  assert.match(sql,/p\.payment_last_payment_at/);
  assert.match(sql,/f\.payment_last_payment_at\s+last_payment_at/);
});

test("el script manual DBeaver es transaccional, idempotente y valida la instalación",async()=>{
  const [core,script]=await Promise.all([readFile(migration,"utf8"),readFile(manual,"utf8")]);
  assert.ok(script.includes(core));
  assert.match(script,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(script,/Execute SQL Script/);
  assert.match(script,/to_regclass\('miclub\.v_enrollment_lifecycle_v2'\)/);
  assert.match(script,/42702/);
});
