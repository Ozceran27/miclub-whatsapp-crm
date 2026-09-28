import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import type { PgPool } from '../db/postgres.js';
import { setPostgresPoolForTests } from '../db/postgres.js';
import { createCrmRoutes } from './crmRoutes.js';

const club='11111111-1111-4111-8111-111111111111';
const first='22222222-2222-4222-8222-222222222222';
const second='33333333-3333-4333-8333-333333333333';
const row=(id:string)=>({enrollmentId:id,personId:'44444444-4444-4444-8444-444444444444',firstName:'Ana',lastName:'Pérez',
  phone:'3764123456',enrollmentDate:'2026-01-01',activityId:'55555555-5555-4555-8555-555555555555',activityName:'Actividad',
  sectorId:'66666666-6666-4666-8666-666666666666',sectorName:'Sector',status:'adeudando',overdueCount:2,
  firstDueDate:'2026-01-01',lastDueDate:'2026-02-01',balances:[{currencyCode:'ARS',amount:1500}],generatedCount:2,undatedCount:0,kind:'overdue'});

const serve=async(fake:PgPool,run:(url:string,queries:string[])=>Promise<void>)=>{
  const queries:string[]=[];
  const original=fake.query;
  fake.query=(sql,params)=>{queries.push(sql);return original(sql,params);};
  fake.connect=()=>Promise.resolve({query:fake.query,release:()=>undefined});
  setPostgresPoolForTests(fake);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{
    req.auth={clubId:club,userId:'77777777-7777-4777-8777-777777777777',membershipId:'88888888-8888-4888-8888-888888888888',
      permissions:['crm:read','crm:write','sectors:any'],sectorIds:[],role:'DIRECTOR',email:'test@example.invalid',legacy:false,personId:'99999999-9999-4999-8999-999999999999'};
    next();
  });app.use(createCrmRoutes());
  const server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});
  const address=server.address();assert.ok(address&&typeof address==='object');
  try{await run(`http://127.0.0.1:${address.port}`,queries);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));setPostgresPoolForTests(undefined);}
};
const post=(url:string,ids:string[])=>fetch(`${url}/prepare-messages`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({memberIds:ids,message:'Hola {nombre}, saldo {saldo}, vencimientos {vencimientos}.'})});
const pool=(ids:string[],failInsert=false,invalidPhoneId?:string)=>({query:(sql:string,params?:unknown[])=>{
  if(sql.includes("from classified where kind='overdue'"))return Promise.resolve({rows:ids.map(id=>({...row(id),phone:id===invalidPhoneId?'':row(id).phone}))});
  if(sql.includes('insert into miclub.crm_message_history')){
    if(failInsert && String(params?.[1])===second)return Promise.reject(new Error('insert failed'));
    return Promise.resolve({rows:[{legacy_sqlite_id:1,member_id:params?.[1],enrollment_id:params?.[3],nombre:'Ana Pérez',phone:'5493764123456',
      message:'Hola Ana',wa_link:'https://web.whatsapp.com/send',status:'prepared',created_at:new Date().toISOString(),opened_at:null,sent_at:null,note:null,template_name:null}]});
  }
  return Promise.resolve({rows:[]});
}} as unknown as PgPool);

void test('preparación rechaza la selección completa si una inscripción no tiene deuda vigente',async()=>{
  await serve(pool([first]),async(url,queries)=>{
    const response=await post(url,[first,second]);assert.equal(response.status,409);
    assert.equal(queries.filter(sql=>sql.includes('insert into miclub.crm_message_history')).length,0);
    assert.ok(queries.includes('ROLLBACK'));
  });
});
void test('preparación conserva atomicidad ante un fallo en el segundo mensaje',async()=>{
  await serve(pool([first,second],true),async(url,queries)=>{
    const response=await post(url,[first,second]);assert.equal(response.status,500);
    assert.equal(queries.filter(sql=>sql.includes('insert into miclub.crm_message_history')).length,2);
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.includes('COMMIT'));
  });
});
void test('preparación rechaza todo el lote si un teléfono dejó de ser válido',async()=>{
  await serve(pool([first,second],false,second),async(url,queries)=>{
    const response=await post(url,[first,second]);assert.equal(response.status,409);
    assert.equal(queries.filter(sql=>sql.includes('insert into miclub.crm_message_history')).length,0);
    assert.ok(queries.includes('ROLLBACK'));
  });
});
void test('preparación inserta vínculos a persona e inscripción y usa el saldo real',async()=>{
  await serve(pool([first]),async(url,queries)=>{
    const response=await post(url,[first]);assert.equal(response.status,200);
    assert.equal((await response.json() as unknown[]).length,1);
    assert.ok(queries.includes('COMMIT'));
  });
});

void test('CRM exige crm:read antes de exponer deuda y crm:write para preparar',async()=>{
  const old=process.env.AUTH_ENABLED;process.env.AUTH_ENABLED='true';
  let permissions:string[]=[];
  const app=express();app.use(express.json());app.use((req,_res,next)=>{
    req.auth={clubId:club,userId:'77777777-7777-4777-8777-777777777777',membershipId:'88888888-8888-4888-8888-888888888888',
      permissions,sectorIds:[],role:'DIRECTOR',email:'test@example.invalid',legacy:false,personId:'99999999-9999-4999-8999-999999999999'};
    next();
  });app.use(createCrmRoutes());process.env.AUTH_ENABLED=old;
  const server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});
  const address=server.address();assert.ok(address&&typeof address==='object');
  try{
    const base=`http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/debt-summary`)).status,403);
    permissions=['crm:read'];
    assert.equal((await post(base,[first])).status,403);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
