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
    return new Response(JSON.stringify({ results: [
      { idVariable: 5, fecha: "2026-08-28", valor: 1365.25 },
      { idVariable: 5, fecha: "2026-08-27", valor: 1360 },
    ] }), { status: 200 });
  };
  const result = await new BcraA3500ExchangeRateProvider().fetchRate("USD", "ARS", "2026-08-31");
  assert.deepEqual(result, { rate: "1365.25", rateDate: "2026-08-28", reference: "variable:5;date:2026-08-28" });
});

test("falla visiblemente para pares que A3500 no publica", async () => {
  await assert.rejects(() => new BcraA3500ExchangeRateProvider().fetchRate("BRL", "ARS", "2026-08-31"), /sólo publica USD\/ARS/);
});
