import assert from "node:assert/strict";
import test from "node:test";
import { PROVISIONED_ONBOARDING_SECTORS } from "@miclub/shared";
import { isCompleteOnboardingRequest, isOpeningBalancesRequest } from "./onboardingValidation.js";

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

const completeRequest=()=>({draft:{
  idempotencyKey:"retry-complete-1",openingBalances:{currency:"ARS",cash:0,bank:0,usdCash:0},
  sectors:PROVISIONED_ONBOARDING_SECTORS.map(sector=>({...sector,templateId:"",color:"#2563EB",status:"active"})),
  workers:[],activities:[],pendingImport:null,
}});
test("permite finalizar sin altas opcionales y con los tres sectores provisionados",()=>{
  assert.equal(isCompleteOnboardingRequest(completeRequest()),true);
});
test("identifica la base de sectores por code e isSystem, no por cantidad",()=>{
  const missing=completeRequest();missing.draft.sectors[0]={...missing.draft.sectors[0],code:"otro"} as never;
  assert.equal(isCompleteOnboardingRequest(missing),false);
  const fake=completeRequest();fake.draft.sectors[0]={...fake.draft.sectors[0],isSystem:false} as never;
  assert.equal(isCompleteOnboardingRequest(fake),false);
});
