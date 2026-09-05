import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../db/postgres.js";
import { billingService, confirmLivePayment } from "./billingService.js";

const withEnv=(values:Record<string,string|undefined>,run:()=>void)=>{const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));try{for(const [key,value] of Object.entries(values))if(value===undefined)delete process.env[key];else process.env[key]=value;run();}finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}};

test("los cuatro planes quedan activos y sin pago en todos los modos configurables",()=>{
 for(const mode of ["disabled","sandbox","live"] as const)withEnv({BILLING_MODE:mode},()=>{
  for(const code of ["FREE","SOCIAL","COMPLEX","CLUB"] as const)assert.deepEqual(
   billingService.prepareOnboardingSelection(code),
   {status:"active",mode,source:"pre_billing_onboarding"},
  );
 });
});
test("la selección pre-billing tampoco requiere excepciones de producción",()=>withEnv({NODE_ENV:"production",BILLING_MODE:"sandbox",DEPLOYMENT_ENV:undefined,BILLING_SANDBOX_STAGING_AUTHORIZATION:undefined},()=>assert.deepEqual(billingService.prepareOnboardingSelection("COMPLEX"),{status:"active",mode:"sandbox",source:"pre_billing_onboarding"})));

test("confirmación futura exige autenticación y activa una sola vez por evento",async()=>{
 const calls:{sql:string;values?:readonly unknown[]}[]=[];let delivery=0;
 const db:QueryExecutor={query:<T>(sql:string,values?:unknown[])=>{calls.push({sql,values});delivery++;return Promise.resolve({rows:[{confirmed:delivery===1}] as T[]});}};
 await assert.rejects(confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:false}),{code:"PAYMENT_CONFIRMATION_UNAUTHENTICATED"});
 assert.equal(await confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:true}),true);
 assert.equal(await confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:true}),false);
 assert.equal(calls.length,2);assert.match(calls[0].sql,/selection_mode='live'.*billing_status='pending_payment'/s);assert.match(calls[0].sql,/on conflict \(gateway_event_id\) do nothing/);
});
