import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations/202608210002_canonical_activity_financial_views.sql");

test("las vistas liquidan por actividad, término histórico, tenant y sector_id", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /100 - term\.club_share_percentage/);
  assert.match(sql, /term\.monthly_fixed_fee/);
  assert.match(sql, /settlement\.period_from BETWEEN term\.effective_from/);
  assert.match(sql, /movement\.club_id = settlement\.club_id/);
  assert.match(sql, /movement\.activity_id = settlement\.activity_id/);
  assert.match(sql, /movement\.operational_status::text IN \('COMPLETADO', 'COMPLETED'\)/);
  assert.match(sql, /allocation\.settlement_id = settlement\.id/);
  assert.match(sql, /allocation\.status = 'COMPLETADO'/);
  assert.match(sql, /GROUP BY sector\.club_id, sector\.id/);
  assert.doesNotMatch(sql, /upper\(|sector\.name\s*=/i);
});

test("FIXED sólo acepta períodos mensuales completos y las anulaciones no participan", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /extract\(day FROM settlement\.period_from\) = 1/);
  assert.match(sql, /interval '1 month - 1 day'/);
  assert.match(sql, /settlement\.voided_at IS NULL/);
  assert.match(sql, /movement\.voided_at IS NULL/);
  assert.match(sql, /allocation\.voided_at IS NULL/);
});
