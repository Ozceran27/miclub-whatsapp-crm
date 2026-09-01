import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import {
  BcbPtaxExchangeRateProvider,
  BcraA3500ExchangeRateProvider,
  EcbUsdEurExchangeRateProvider,
  resolveOfficialExchangeRateProvider,
  supportedOfficialExchangeRatePairs,
} from "./officialExchangeRateProvider.js";

const mockFetch = (context: TestContext, implementation: typeof fetch) => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  globalThis.fetch = implementation;
};

test("el registro resuelve exclusivamente los tres pares oficiales", () => {
  assert.deepEqual(supportedOfficialExchangeRatePairs(), ["USD/ARS", "USD/BRL", "USD/EUR"]);
  assert.ok(resolveOfficialExchangeRateProvider("USD", "ARS") instanceof BcraA3500ExchangeRateProvider);
  assert.ok(resolveOfficialExchangeRateProvider("USD", "BRL") instanceof BcbPtaxExchangeRateProvider);
  assert.ok(resolveOfficialExchangeRateProvider("USD", "EUR") instanceof EcbUsdEurExchangeRateProvider);
  assert.throws(() => resolveOfficialExchangeRateProvider("EUR", "USD"), /No hay proveedor oficial/);
});

test("BCRA adapta A3500 y usa la última observación hábil del fin de semana", async (context) => {
  mockFetch(context, async (input) => {
    const url = String(input);
    assert.match(url, /Monetarias\/5/);
    assert.match(url, /Desde=2026-08-24/);
    assert.match(url, /Hasta=2026-08-31/);
    return new Response(JSON.stringify({ results: [{ idVariable: 5, detalle: [
      { fecha: "2026-08-27T00:00:00", valor: 1360 },
      { fecha: "2026-08-28T00:00:00", valor: 1365.25 },
    ] }] }));
  });
  assert.deepEqual(await new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31"), {
    rate: "1365.25", rateDate: "2026-08-28", reference: "variable:5;date:2026-08-28",
  });
});

test("BCB adapta SGS 1 y usa la última PTAX hábil del fin de semana", async (context) => {
  mockFetch(context, async (input) => {
    const endpoint = new URL(String(input));
    assert.equal(endpoint.searchParams.get("dataInicial"), "24/08/2026");
    assert.equal(endpoint.searchParams.get("dataFinal"), "31/08/2026");
    return new Response(JSON.stringify([{ data: "27/08/2026", valor: "5.4100" }, { data: "28/08/2026", valor: "5,4321" }]));
  });
  assert.deepEqual(await new BcbPtaxExchangeRateProvider().fetchRate("USD", "BRL", "2026-08-31"), {
    rate: "5.4321", rateDate: "2026-08-28", reference: "series:1;date:2026-08-28",
  });
});

test("BCE invierte USD por EUR y usa la última observación hábil", async (context) => {
  mockFetch(context, async (input) => {
    const endpoint = new URL(String(input));
    assert.equal(endpoint.searchParams.get("format"), "csvdata");
    assert.equal(endpoint.searchParams.get("startPeriod"), "2026-08-24");
    return new Response("TIME_PERIOD,OBS_VALUE\n2026-08-27,1.20\n2026-08-28,1.25\n");
  });
  assert.deepEqual(await new EcbUsdEurExchangeRateProvider().fetchRate("USD", "EUR", "2026-08-31"), {
    rate: "0.8", rateDate: "2026-08-28", reference: "key:D.USD.EUR.SP00.A;date:2026-08-28;published:1.25;transform:inverse",
  });
});

for (const scenario of [
  { name: "BCRA", env: "BCRA", create: () => new BcraA3500ExchangeRateProvider(), pair: ["USD", "ARS"] as const, empty: JSON.stringify({ results: [] }), invalid: "null" },
  { name: "BCB", env: "BCB", create: () => new BcbPtaxExchangeRateProvider(), pair: ["USD", "BRL"] as const, empty: "[]", invalid: JSON.stringify({ results: [] }) },
  { name: "BCE", env: "ECB", create: () => new EcbUsdEurExchangeRateProvider(), pair: ["USD", "EUR"] as const, empty: "TIME_PERIOD,OBS_VALUE\n", invalid: "wrong,columns\n2026-08-28,1.2" },
]) {
  test(`${scenario.name} informa ausencia de observaciones`, async (context) => {
    mockFetch(context, async () => new Response(scenario.empty));
    const [base, quote] = scenario.pair;
    await assert.rejects(scenario.create().fetchRate(base, quote, "2026-08-31"), /no devolvió una observación admisible/);
  });

  test(`${scenario.name} rechaza HTTP no exitoso después de reintentar`, async (context) => {
    const retryKey = `EXCHANGE_RATE_${scenario.env}_RETRIES`;
    const original = process.env[retryKey];
    process.env[retryKey] = "2";
    context.after(() => { if (original == null) delete process.env[retryKey]; else process.env[retryKey] = original; });
    let calls = 0;
    mockFetch(context, async () => { calls += 1; return new Response("caído", { status: 503 }); });
    const [base, quote] = scenario.pair;
    await assert.rejects(scenario.create().fetchRate(base, quote, "2026-08-31"), /HTTP 503/);
    assert.equal(calls, 2);
  });

  test(`${scenario.name} rechaza un payload inválido`, async (context) => {
    mockFetch(context, async () => new Response(scenario.invalid));
    const [base, quote] = scenario.pair;
    await assert.rejects(scenario.create().fetchRate(base, quote, "2026-08-31"), /payload inválido|CSV inválido|observación admisible/);
  });
}

test("cada adaptador rechaza pares ajenos", async () => {
  await assert.rejects(new BcraA3500ExchangeRateProvider().fetchRate("USD", "BRL", "2026-08-31"), /sólo publica USD\/ARS/);
  await assert.rejects(new BcbPtaxExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31"), /sólo publica USD\/BRL/);
  await assert.rejects(new EcbUsdEurExchangeRateProvider().fetchRate("EUR", "USD", "2026-08-31"), /sólo admite USD\/EUR/);
});
