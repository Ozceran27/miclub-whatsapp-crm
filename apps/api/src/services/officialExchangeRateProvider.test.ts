import assert from "node:assert/strict";
import test from "node:test";
import { BcraA3500ExchangeRateProvider } from "./officialExchangeRateProvider.js";

test("adapta la respuesta oficial A3500 y elige el último día hábil", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.match(url, /Monetarias\/5/);
    assert.match(url, /Desde=2026-08-24/);
    assert.match(url, /Hasta=2026-08-31/);
    assert.match(url, /Limit=8/);
    assert.match(url, /Offset=0/);
    assert.doesNotMatch(url, /Order=/);
    return new Response(JSON.stringify({ results: [
      { idVariable: 5, fecha: "2026-08-28", valor: 1365.25 },
      { idVariable: 5, fecha: "2026-08-27", valor: 1360 },
    ] }), { status: 200 });
  };
  const result = await new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31");
  assert.deepEqual(result, { rate: "1365.25", rateDate: "2026-08-28", reference: "variable:5;date:2026-08-28" });
});

test("no envía el parámetro Order que la API v4 rechaza con HTTP 400", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    const endpoint = new URL(String(input));
    assert.equal(endpoint.searchParams.has("Order"), false);
    assert.equal(endpoint.searchParams.get("Offset"), "0");
    return new Response(JSON.stringify({ results: [{ idVariable: 5, fecha: "2026-08-28", valor: 1365.25 }] }), { status: 200 });
  };
  await assert.doesNotReject(new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31"));
});

test("extrae observaciones de la respuesta v4 agrupada por variable", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [{
    idVariable: 5,
    detalle: [{ fecha: "2026-08-28T00:00:00", valor: 1365.25 }],
  }] }), { status: 200 });
  const result = await new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31");
  assert.deepEqual(result, { rate: "1365.25", rateDate: "2026-08-28", reference: "variable:5;date:2026-08-28" });
});

test("informa ventana y forma de respuesta cuando no hay datos", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 200, results: [] }), { status: 200 });
  await assert.rejects(
    new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31"),
    /2026-08-24\.\.2026-08-31 \(claves=status,results, observaciones=0\)/,
  );
});

test("falla visiblemente para pares que A3500 no publica", async () => {
  await assert.rejects(() => new BcraA3500ExchangeRateProvider().fetchRate("BRL", "ARS", "2026-08-31"), /sólo publica USD\/ARS/);
});

test("migra automáticamente una URL v3 retirada con HTTP 410 hacia v4", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.EXCHANGE_RATE_PROVIDER_URL;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl == null) delete process.env.EXCHANGE_RATE_PROVIDER_URL;
    else process.env.EXCHANGE_RATE_PROVIDER_URL = originalUrl;
  });
  process.env.EXCHANGE_RATE_PROVIDER_URL = "https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias";
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    if (String(input).includes("/v3.0/")) return new Response("API version retired", { status: 410 });
    return new Response(JSON.stringify({ results: [{ idVariable: 5, fecha: "2026-08-28", valor: 1365.25 }] }), { status: 200 });
  };
  const result = await new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31");
  assert.equal(result.rate, "1365.25");
  assert.equal(requested.length, 2);
  assert.match(requested[0]!, /\/v3\.0\//);
  assert.match(requested[1]!, /\/v4\.0\//);
});
