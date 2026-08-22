import { PROVISIONED_ONBOARDING_SECTORS, SUPPORTED_OPERATIONAL_CURRENCIES, type CompleteOnboardingRequest, type OpeningBalancesRequest } from "@miclub/shared";

export const isOpeningBalancesRequest = (body: unknown): body is OpeningBalancesRequest => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as Partial<OpeningBalancesRequest>;
  return !Object.keys(body).some(key => !["currency", "cash", "bank", "usdCash", "idempotencyKey"].includes(key))
    && SUPPORTED_OPERATIONAL_CURRENCIES.some(currency => currency === input.currency)
    && [input.cash,input.bank,input.usdCash].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
    && typeof input.idempotencyKey === "string" && Boolean(input.idempotencyKey.trim());
};

export const isCompleteOnboardingRequest=(body:unknown):body is CompleteOnboardingRequest=>{
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="draft"))return false;
 const d=(body as CompleteOnboardingRequest).draft;
 if(!d||typeof d!=="object"||!/^[\w-]{8,128}$/.test(d.idempotencyKey)||!isOpeningBalancesRequest({...d.openingBalances,idempotencyKey:d.idempotencyKey}))return false;
 if(!Array.isArray(d.sectors)||!Array.isArray(d.workers)||!Array.isArray(d.activities)||d.sectors.length>100||d.workers.length>100||d.activities.length>200)return false;
 const ids=(values:{clientId:string}[])=>values.every(x=>typeof x.clientId==='string'&&x.clientId.length>0)&&new Set(values.map(x=>x.clientId)).size===values.length;
 if(!ids(d.sectors)||!ids(d.workers)||!ids(d.activities))return false;
 if(!d.sectors.every(x=>typeof x.code==='string'&&x.code.length>0&&typeof x.isSystem==='boolean'&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=120&&/^#[0-9a-f]{6}$/i.test(x.color)&&['active','inactive','under_repair'].includes(x.status)))return false;
 const requiredSystemCodes=new Set(PROVISIONED_ONBOARDING_SECTORS.map(sector=>sector.code));
 const systemSectors=d.sectors.filter(sector=>sector.isSystem);
 if(systemSectors.some(sector=>!requiredSystemCodes.has(sector.code as never))||[...requiredSystemCodes].some(code=>systemSectors.filter(sector=>sector.code===code).length!==1))return false;
 if(d.sectors.some(sector=>!sector.isSystem&&requiredSystemCodes.has(sector.code as never)))return false;
 if(!d.workers.every(x=>x.firstName?.trim()&&x.lastName?.trim()&&/^\d{7,9}$/.test(x.dni)&&typeof x.email==='string'&&x.email.includes('@')&&typeof x.password==='string'&&x.password.length>=10&&['TRABAJADOR','INSTRUCTOR'].includes(x.role)&&['FIXED','VARIABLE'].includes(x.paymentMode)))return false;
 const sectorIds=new Set(d.sectors.map(x=>x.clientId));
 if(!d.activities.every(x=>typeof x.name==='string'&&x.name.trim()&&sectorIds.has(x.sectorClientId)&&Number.isFinite(x.enrollmentFee)&&x.enrollmentFee>=0&&Number.isFinite(x.economicValue)&&x.economicValue>=0&&['FIXED','VARIABLE'].includes(x.settlementMode)&&['active','inactive'].includes(x.status)))return false;
 return d.pendingImport===null||(typeof d.pendingImport?.batchId==='string'&&d.pendingImport.batchId.length>0);
};
