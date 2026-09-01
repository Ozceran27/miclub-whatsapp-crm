import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(new URL("../../db/migrations/202609010002_canonical_liquidity_valuation.sql", import.meta.url), "utf8");

test("admite monedas operativas ARS, BRL, EUR y USD y conserva nominales", () => {
  for (const currency of ["ARS", "BRL", "EUR", "USD"]) assert.ok(sql.includes("currency_code"), currency);
  assert.match(sql, /'nominalBalance',nominal_balance/);
  assert.match(sql, /'usdNominalBalance'/);
  assert.match(sql, /'convertedBalance',converted_balance/);
});

test("resuelve directa e inversa sin aceptar futuras ni vencidas", () => {
  assert.match(sql, /er\.rate_date <= p_cutoff_date/);
  assert.match(sql, /er\.rate_date >= p_cutoff_date - 4/);
  assert.match(sql, /THEN a\.nominal_balance\*r\.rate/);
  assert.match(sql, /THEN a\.nominal_balance\/r\.rate/);
  assert.match(sql, /'DIRECT'/);
  assert.match(sql, /'INVERSE'/);
});

test("cero y negativos preservan signo y toda falta bloquea el total", () => {
  assert.doesNotMatch(sql, /nominal_balance\s*[><=]+\s*0/);
  assert.match(sql, /INCOMPLETE_EXCHANGE_RATE/);
  assert.match(sql, /THEN NULL ELSE coalesce\(complete_liquidity,0\)/);
  assert.match(sql, /unvalued_account_count/);
  assert.match(sql, /missing_pairs/);
});

test("expone componentes reconciliables y registra cálculos cerrados", () => {
  assert.match(sql, /FILTER \(WHERE code='CASH'\)/);
  assert.match(sql, /FILTER \(WHERE code='BANK'\)/);
  assert.match(sql, /FILTER \(WHERE currency_code='USD'\)/);
  assert.match(sql, /record_exchange_rate_usage/);
  assert.match(sql, /exchange_rate_usages/);
});
