import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = (name: string) => readFileSync(new URL(`../../../../docs/dbeaver/${name}`, import.meta.url), "utf8");

test("SQL DBeaver usa las columnas reales y recupera transacciones abortadas", () => {
  const diagnostic = sql("01_auth_tenant_diagnostic_readonly.sql");
  const backfill = sql("02_miclub_backfill_manual.sql");
  const validation = sql("03_final_validation_readonly.sql");

  for (const script of [diagnostic, backfill, validation]) {
    assert.match(script, /ROLLBACK;/);
    assert.match(script, /\r?\n/);
  }
  assert.match(diagnostic, /ie\.batch_id/);
  assert.doesNotMatch(diagnostic, /ie\.import_batch_id/);
  assert.doesNotMatch(backfill, /min\s*\(\s*id\s*\)/i);
  assert.match(backfill, /movement_type::text/);
  assert.match(validation, /movement_type::text/);
});
