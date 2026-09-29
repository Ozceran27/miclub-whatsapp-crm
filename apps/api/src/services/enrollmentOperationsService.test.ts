import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSIONS } from '@miclub/shared';
import type { QueryExecutor } from '../db/postgres.js';
import type { RequestAuthContext } from '../auth/types.js';
import { createOperationalEnrollment, generateFeesForMonth } from './enrollmentOperationsService.js';

const club='11111111-1111-4111-8111-111111111111';
const sector='22222222-2222-4222-8222-222222222222';
const activity='33333333-3333-4333-8333-333333333333';
const person='44444444-4444-4444-8444-444444444444';
const enrollment='55555555-5555-4555-8555-555555555555';
const price='66666666-6666-4666-8666-666666666666';
const auth={clubId:club,sectorIds:[sector],permissions:[PERMISSIONS.ENROLLMENTS_CREATE],userId:person,personId:person,membershipId:person,email:'test@example.com',legacy:false,role:'DIRECTOR'} satisfies RequestAuthContext;

void test('alta crea persona, inscripción y dos cargos con tenant y período explícitos',async()=>{
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const db:QueryExecutor={query:<T>(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    let rows:unknown[]=[];
    if(sql.includes('from miclub.activities where'))rows=[{sector_id:sector}];
    else if(sql.includes('from miclub.people where')&&sql.includes('limit 1'))rows=[];
    else if(sql.includes('insert into miclub.people'))rows=[{id:person}];
    else if(sql.includes('from miclub.enrollments where'))rows=[];
    else if(sql.includes('from miclub.activity_price_terms'))rows=[{id:price,enrollment_price:1500,fee_price:5000,fee_frequency:'MONTHLY',currency_code:'ARS'}];
    else if(sql.includes('insert into miclub.enrollments'))rows=[{id:enrollment}];
    else if(sql.includes('insert into miclub.receivables'))rows=[{id:crypto.randomUUID(),amount:params[7]}];
    return Promise.resolve({rows:rows as T[]});
  }};
  const result=await createOperationalEnrollment(db,auth,{person:{firstName:'Ana',lastName:'Pérez',document:'12.345.678',phone:'3764123456'},activityId:activity,enrollmentDate:'2026-09-28'});
  assert.equal(result.charges.length,2);
  assert.equal(result.movementIds.length,0);
  const charges=calls.filter(c=>c.sql.includes('insert into miclub.receivables'));
  assert.deepEqual(charges.map(c=>c.params[10]),['ENROLLMENT','FEE']);
  assert.equal(charges[1].params[11],'2026-10-27');
  assert.ok(calls.filter(c=>c.sql.includes('insert into miclub.people')||c.sql.includes('insert into miclub.enrollments')).every(c=>c.params[0]===club));
});

void test('la actividad de otro sector se rechaza antes de crear persona',async()=>{
  const sqls:string[]=[];
  const db:QueryExecutor={query:<T>(sql:string)=>{sqls.push(sql);return Promise.resolve({rows:(sql.includes('from miclub.activities where')?[{sector_id:'99999999-9999-4999-8999-999999999999'}]:[]) as T[]});}};
  await assert.rejects(createOperationalEnrollment(db,auth,{person:{firstName:'Ana',lastName:'Pérez',document:'12345678',phone:'3764123456'},activityId:activity,enrollmentDate:'2026-09-28'}),/Actividad no disponible/);
  assert.equal(sqls.some(sql=>sql.includes('insert into')),false);
});

void test('generación mensual conserva la cuota existente y el precio vigente de una nueva',async()=>{
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const db:QueryExecutor={query:<T>(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});let rows:unknown[]=[];
    if(sql.includes('from miclub.enrollments e join'))rows=[{id:enrollment,person_id:person,activity_id:activity,sector_id:sector,enrollment_date:'2026-01-31',fee_frequency_snapshot:'MONTHLY',fee_price_snapshot:1000,fee_amount:1000,status:'al_dia',inactive:false,end_date:null,document:'12345678'}];
    else if(sql.includes('from miclub.activity_price_terms'))rows=[{id:price,enrollment_price:0,fee_price:2500,fee_frequency:'MONTHLY',currency_code:'ARS'}];
    else if(sql.includes('period_month=extract'))rows=[{id:crypto.randomUUID(),amount:1000}];
    return Promise.resolve({rows:rows as T[]});
  }};
  const result=await generateFeesForMonth(db,auth,'2026-02',enrollment);
  assert.deepEqual(result,{generated:0,existing:1,rejected:[]});
  assert.equal(calls.some(c=>c.sql.includes('insert into miclub.receivables')),false);
});
