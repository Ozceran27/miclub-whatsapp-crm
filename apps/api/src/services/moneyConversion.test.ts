import assert from "node:assert/strict";
import test from "node:test";
import { convertMoney, type AppliedExchangeRate } from "./moneyConversion.js";

const quote: AppliedExchangeRate = { baseCurrencyCode: "USD", quoteCurrencyCode: "ARS", rate: "1234.567", rateDate: "2026-08-28", rateType: "official", source: "BCRA" };
test("convierte USD 100 a ARS sin sumar el nominal", () => assert.equal(convertMoney({ amount: "100", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-31", quote }), "123456.70"));
test("redondea half-away-from-zero a centavos", () => assert.equal(convertMoney({ amount: "0.005", fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-28", quote: { ...quote, rate: "1" } }), "0.01"));
test("soporta el par inverso", () => assert.equal(convertMoney({ amount: "1234.567", fromCurrency: "ARS", toCurrency: "USD", valuationDate: "2026-08-31", quote }), "1.00"));
test("rechaza cotizaciones futuras", () => assert.throws(() => convertMoney({ amount: 1, fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-27", quote }), /posterior/));
test("admite la última cotización hábil para fin de semana/feriado", () => assert.equal(convertMoney({ amount: 1, fromCurrency: "USD", toCurrency: "ARS", valuationDate: "2026-08-31", quote }), "1234.57"));
