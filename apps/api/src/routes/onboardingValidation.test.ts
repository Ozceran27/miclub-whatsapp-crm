import assert from "node:assert/strict";
import test from "node:test";
import { isOpeningBalancesRequest } from "./onboardingValidation.js";

const valid = { currency:"ARS", cash:0, bank:10.25, usdCash:0.01, idempotencyKey:"retry-1" };
test("acepta ceros y decimales no negativos",()=>assert.equal(isOpeningBalancesRequest(valid),true));
test("rechaza moneda ausente o fuera de la lista explícita",()=>{
  assert.equal(isOpeningBalancesRequest({...valid,currency:undefined}),false);
  assert.equal(isOpeningBalancesRequest({...valid,currency:"GBP"}),false);
});
test("rechaza importes negativos y campos adicionales",()=>{
  assert.equal(isOpeningBalancesRequest({...valid,cash:-0.01}),false);
  assert.equal(isOpeningBalancesRequest({...valid,clubId:"client-controlled"}),false);
});
