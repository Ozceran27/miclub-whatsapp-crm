import assert from "node:assert/strict";
import test from "node:test";
import { convertMoney, divideDecimal, multiplyDecimal, type AppliedExchangeRate } from "./moneyConversion.js";

const quote: AppliedExchangeRate = { baseCurrencyCode: "USD", quoteCurrencyCode: "ARS", rate: "1234.567", rateDate: "2026-08-28", rateType: "official", source: "BCRA" };
test("convierte USD 100 a ARS sin sumar el nominal", () => assert.equal(convertMoney({ amount: "100", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-31", quote }), "123456.70"));
test("redondea half-away-from-zero a centavos para ambos signos", () => {
  const unit = { ...quote, rate: "1" };
  assert.equal(convertMoney({ amount: "0.005", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-28", quote: unit }), "0.01");
  assert.equal(convertMoney({ amount: "-0.005", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-28", quote: unit }), "-0.01");
  assert.equal(convertMoney({ amount: "0.0049", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-28", quote: unit }), "0.00");
});
test("mantiene precisión decimal para importes grandes y tasas largas", () => {
  assert.equal(convertMoney({ amount: "999999999999.999999", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-28", quote: { ...quote, rate: "1.000000000001" } }), "1000000000001.00");
  assert.equal(multiplyDecimal("0.123456789012", "0.987654321098"), "0.121932631137");
  assert.equal(divideDecimal("1", "3"), "0.333333333333");
});
test("rechaza una cotización no normalizada y cotizaciones futuras", () => {
  assert.throws(() => convertMoney({ amount: 1, fromCurrency: "ARS", toCurrency: "USD", valuationDate: "2026-08-31", quote }), /normalizada/);
  assert.throws(() => convertMoney({ amount: 1, fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-27", quote }), /posterior/);
});
