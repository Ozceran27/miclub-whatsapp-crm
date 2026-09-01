import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../db/postgres.js";
import { billingService, confirmLivePayment } from "./billingService.js";

const withEnv=(values:Record<string,string|undefined>,run:()=>void)=>{const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));try{for(const [key,value] of Object.entries(values))if(value===undefined)delete process.env[key];else process.env[key]=value;run();}finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}};

test("FREE queda activo sin depender del modo",()=>withEnv({BILLING_MODE:"disabled"},()=>assert.deepEqual(billingService.prepareOnboardingSelection("FREE"),{status:"active",mode:"disabled",source:"free"})));
test("sandbox activa los tres planes pagos y marca la simulación",()=>withEnv({NODE_ENV:"development",BILLING_MODE:"sandbox"},()=>{for(const code of ["SOCIAL","COMPLEX","CLUB"] as const)assert.deepEqual(billingService.prepareOnboardingSelection(code),{status:"active",mode:"sandbox",source:"sandbox_onboarding"});}));
test("live no concede capacidades antes del pago",()=>withEnv({BILLING_MODE:"live"},()=>assert.deepEqual(billingService.prepareOnboardingSelection("CLUB"),{status:"pending_payment",mode:"live",source:"future_gateway"})));
test("disabled rechaza planes pagos",()=>withEnv({BILLING_MODE:"disabled"},()=>assert.throws(()=>billingService.prepareOnboardingSelection("SOCIAL"),{code:"PAID_PLAN_SELECTION_DISABLED"})));
test("producción rechaza sandbox excepto staging con autorización fuerte",()=>withEnv({NODE_ENV:"production",BILLING_MODE:"sandbox",DEPLOYMENT_ENV:undefined,BILLING_SANDBOX_STAGING_AUTHORIZATION:undefined},()=>assert.throws(()=>billingService.prepareOnboardingSelection("COMPLEX"),{code:"BILLING_SANDBOX_FORBIDDEN"})));
test("staging de producción explícitamente autorizado admite sandbox",()=>withEnv({NODE_ENV:"production",BILLING_MODE:"sandbox",DEPLOYMENT_ENV:"staging",BILLING_SANDBOX_STAGING_AUTHORIZATION:"authorization-value-at-least-32-characters"},()=>assert.equal(billingService.prepareOnboardingSelection("SOCIAL").status,"active")));

test("confirmación futura exige autenticación y activa una sola vez por evento",async()=>{
 const calls:{sql:string;values?:readonly unknown[]}[]=[];let delivery=0;
 const db:QueryExecutor={query:<T>(sql:string,values?:unknown[])=>{calls.push({sql,values});delivery++;return Promise.resolve({rows:[{confirmed:delivery===1}] as T[]});}};
 await assert.rejects(confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:false}),{code:"PAYMENT_CONFIRMATION_UNAUTHENTICATED"});
 assert.equal(await confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:true}),true);
 assert.equal(await confirmLivePayment(db,{clubId:"club",subscriptionId:"subscription",gatewayEventId:"event",authenticated:true}),false);
 assert.equal(calls.length,2);assert.match(calls[0].sql,/selection_mode='live'.*billing_status='pending_payment'/s);assert.match(calls[0].sql,/on conflict \(gateway_event_id\) do nothing/);
});
