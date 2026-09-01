import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../db/postgres.js";
import { createExchangeRateService } from "./exchangeRateService.js";
import type { CurrencyCode } from "./moneyConversion.js";

const stored = [
  { id: "usd-ars", base_currency_code: "USD", quote_currency_code: "ARS", rate: "1234.567890123456", rate_date: "2026-08-31", rate_type: "official", source: "BCRA" },
  { id: "usd-brl", base_currency_code: "USD", quote_currency_code: "BRL", rate: "5.250000000001", rate_date: "2026-08-30", rate_type: "official", source: "BCB" },
  { id: "eur-usd", base_currency_code: "EUR", quote_currency_code: "USD", rate: "1.200000000000", rate_date: "2026-08-29", rate_type: "official", source: "ECB" },
];

const executor = { query: (sql: string, values: unknown[] = []) => {
  if (!sql.includes("with candidates")) return Promise.resolve({ rows: [], rowCount: 0 });
  const [base, quote, date] = values as [string, string, string];
  const rows = stored.filter((row) => row.rate_date <= date &&
    ((row.base_currency_code === base && row.quote_currency_code === quote) ||
     (row.base_currency_code === quote && row.quote_currency_code === base)))
    .sort((a, b) => b.rate_date.localeCompare(a.rate_date));
  return Promise.resolve({ rows: rows.slice(0, 1), rowCount: rows.length ? 1 : 0 });
} } as QueryExecutor;
const service = createExchangeRateService({ source: "unused", fetchRate: () => Promise.reject(new Error("unused")) }, { maxAgeDays: 4, pivot: "USD", executor });

const expected: Record<string, string> = {
  "USD/ARS": "1234.567890123456", "ARS/USD": "0.000810000007",
  "USD/BRL": "5.250000000001", "BRL/USD": "0.190476190476",
  "USD/EUR": "0.833333333333", "EUR/USD": "1.200000000000",
  "BRL/EUR": "0.15873015873", "EUR/BRL": "6.300000000001",
};
for (const [pair, rate] of Object.entries(expected)) test(`normaliza ${pair}`, async () => {
  const [base, quote] = pair.split("/") as [CurrencyCode, CurrencyCode];
  const result = await service.latest(base, quote, "2026-09-01");
  assert.equal(result.rate, rate);
  assert.equal(result.baseCurrencyCode, base);
  assert.equal(result.quoteCurrencyCode, quote);
  assert.equal(result.components?.length, base !== "USD" && quote !== "USD" ? 2 : 1);
  assert.equal(result.rateDate, pair === "USD/ARS" || pair === "ARS/USD" ? "2026-08-31" : pair.includes("EUR") ? "2026-08-29" : "2026-08-30");
});

test("la inversa conserva explícitamente la cotización original", async () => {
  const result = await service.latest("ARS", "USD", "2026-09-01");
  assert.equal(result.kind, "inverse");
  assert.deepEqual(result.components?.[0], { id: "usd-ars", baseCurrencyCode: "USD", quoteCurrencyCode: "ARS", rate: "1234.567890123456", rateDate: "2026-08-31", rateType: "official", source: "BCRA", direction: "inverse" });
  assert.ok(Object.isFrozen(result.components));
  assert.ok(Object.isFrozen(result.components?.[0]));
});

test("valida la antigüedad de cada tramo cruzado", async () => {
  const strict = createExchangeRateService({ source: "unused", fetchRate: () => Promise.reject(new Error("unused")) }, { maxAgeDays: 2, pivot: "USD", executor });
  await assert.rejects(strict.latest("BRL", "EUR", "2026-09-01"), /Cotización vencida \(3 días/);
});
