import assert from "node:assert/strict";
import test from "node:test";
import { PROVISIONED_ONBOARDING_SECTORS, type CompleteOnboardingRequest } from "@miclub/shared";
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

const completeRequest=():CompleteOnboardingRequest=>({draft:{
  idempotencyKey:"retry-complete-1",openingBalances:{currency:"ARS",cash:0,bank:0,usdCash:0},
  sectors:PROVISIONED_ONBOARDING_SECTORS.map(sector=>({...sector,color:"#2563EB",status:"active"})),
  workers:[],activities:[],pendingImport:null,
}});
test("permite finalizar sin altas opcionales y con los tres sectores provisionados",()=>{
  assert.equal(isCompleteOnboardingRequest(completeRequest()),true);
});
test("identifica la base de sectores por code e isSystem, no por cantidad",()=>{
  const missing=completeRequest();missing.draft.sectors[0]={...missing.draft.sectors[0],code:"otro"};
  assert.equal(isCompleteOnboardingRequest(missing),false);
  const fake=completeRequest();fake.draft.sectors[0]={...fake.draft.sectors[0],isSystem:false};
  assert.equal(isCompleteOnboardingRequest(fake),false);
});
test("exige una clave semántica del catálogo para cada sector",()=>{
  const emoji=completeRequest();emoji.draft.sectors[0]={...emoji.draft.sectors[0],iconKey:"🏢"};
  assert.equal(isCompleteOnboardingRequest(emoji),false);
  const unknown=completeRequest();unknown.draft.sectors[0]={...unknown.draft.sectors[0],iconKey:"not-in-catalog"};
  assert.equal(isCompleteOnboardingRequest(unknown),false);
});
test("rechaza identificadores temporales repetidos y referencias cruzadas inválidas",()=>{
  const duplicate=completeRequest();duplicate.draft.workers=[{clientId:duplicate.draft.sectors[0].clientId,firstName:"Ana",lastName:"Pérez",dni:"12345678",email:"ana@example.com",password:"segura12345",role:"INSTRUCTOR",hasFixedCompensation:false,fixedCompensationAmount:null,fixedCompensationFrequency:null}];
  assert.equal(isCompleteOnboardingRequest(duplicate),false);
  const dangling=completeRequest();dangling.draft.activities=[{clientId:"activity:1",sectorClientId:"sector:missing",instructorClientId:null,name:"Yoga",iconKey:"yoga",color:"#2563EB",enrollmentFee:0,enrollmentFeeFrequency:"MONTHLY",settlementMode:"FIXED",fixedClubFee:0,fixedFeeFrequency:"MONTHLY",clubSharePercentage:null,status:"active"}];
  assert.equal(isCompleteOnboardingRequest(dangling),false);
});
test("sólo acepta responsables instructores y porcentajes VARIABLE entre cero y cien",()=>{
  const request=completeRequest();request.draft.workers=[{clientId:"worker:1",firstName:"Ana",lastName:"Pérez",dni:"12345678",email:"ana@example.com",password:"segura12345",role:"TRABAJADOR",hasFixedCompensation:false,fixedCompensationAmount:null,fixedCompensationFrequency:null}];
  request.draft.activities=[{clientId:"activity:1",sectorClientId:request.draft.sectors[0].clientId,instructorClientId:"worker:1",name:"Yoga",iconKey:"yoga",color:"#2563EB",enrollmentFee:0,enrollmentFeeFrequency:"MONTHLY",settlementMode:"VARIABLE",fixedClubFee:null,fixedFeeFrequency:null,clubSharePercentage:101,status:"active"}];
  assert.equal(isCompleteOnboardingRequest(request),false);
  request.draft.workers[0].role="INSTRUCTOR";request.draft.activities[0].clubSharePercentage=100;
  assert.equal(isCompleteOnboardingRequest(request),true);
});
test("rechaza montos fijos negativos, infinitos y referencias de importación mal formadas",()=>{
  const request=completeRequest();request.draft.workers=[{clientId:"worker:1",firstName:"Ana",lastName:"Pérez",dni:"12345678",email:"ana@example.com",password:"segura12345",role:"TRABAJADOR",hasFixedCompensation:true,fixedCompensationAmount:-1,fixedCompensationFrequency:"MONTHLY"}];
  assert.equal(isCompleteOnboardingRequest(request),false);
  request.draft.workers[0].fixedCompensationAmount=Number.POSITIVE_INFINITY;
  assert.equal(isCompleteOnboardingRequest(request),false);
  const imported=completeRequest();imported.draft.pendingImport={batchId:"bad id with spaces"};
  assert.equal(isCompleteOnboardingRequest(imported),false);
});
