import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../db/migrations/202608140008_canonical_onboarding_and_opening_balances.sql", import.meta.url), "utf8");

test("onboarding relacional elimina y prohíbe autoridades JSON paralelas", () => {
  assert.match(migration, /settings[\s\S]*- 'onboarding'/);
  assert.match(migration, /clubs_settings_non_relational_check/);
  assert.match(migration, /NOT coalesce\(settings, '\{\}'::jsonb\) \?\|/);
});

test("saldos iniciales son lotes idempotentes ligados a CAPITAL y cuentas", () => {
  assert.match(migration, /opening_balance_batches_club_idempotency_key UNIQUE \(club_id, idempotency_key\)/);
  assert.match(migration, /VALUES \('CASH',p_cash\),\('BANK',p_bank\),\('USD_CASH',p_usd_cash\)/);
  assert.match(migration, /'CAPITAL','Saldo inicial'/);
  assert.match(migration, /opening_balance_movements\(movement_id,batch_id\)/);
});

test("liquidez y conciliación se derivan del ledger sin operational_balances", () => {
  const liquidity = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW miclub.v_financial_account_liquidity"));
  assert.match(liquidity, /JOIN miclub\.movements/);
  assert.match(migration, /v_opening_balance_reconciliation[\s\S]*account_code[\s\S]*is_consistent/);
  assert.doesNotMatch(liquidity, /FROM miclub\.operational_balances/i);
});
