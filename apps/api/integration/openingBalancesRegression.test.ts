import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {PROVISIONED_ONBOARDING_SECTORS} from '@miclub/shared';
import {assertIsolatedTestCluster} from '../src/db/testClusterGuard.js';
import type {PgPool, QueryExecutor} from '../src/db/postgres.js';
import {workbookFixture} from '../src/services/xlsxMigration/fixtures/workbookFixtures.js';

const controlUrl=process.env.MIGRATION_GATE_DATABASE_URL;
void test('opening balances: real HTTP completion, sequences, retries, reversals and rollback',{
 skip:controlUrl?false:'Dedicated marked test cluster required',timeout:120000,
},async t=>{
 const control=new pg.Pool({connectionString:controlUrl});
 try {await assertIsolatedTestCluster(control);} catch(error){await control.end();throw error;}
 const name=`miclub_opening_test_${randomBytes(6).toString('hex')}`;
 const url=new URL(controlUrl!);url.pathname=`/${name}`;
 await control.query(`create database ${name}`);
 const db=new pg.Pool({connectionString:url.toString()});
 let server:import('node:http').Server|undefined;
 try{
  await promisify(execFile)(process.execPath,['--import','tsx','apps/api/src/scripts/runMigrations.ts'],{
   env:{...process.env,ADMIN_DATABASE_URL:url.toString(),PGADMINROLE:''},maxBuffer:4*1024*1024,
  });
  // The delivered DBeaver patch must also safely replay an already applied patch.
  await db.query(await readFile('docs/dbeaver/2026-09-08-onboarding-correction.sql','utf8'));
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:url.toString(),ADMIN_DATABASE_URL:url.toString(),
   PUBLIC_APP_URL:'http://localhost:5173',CORS_ORIGINS:'http://localhost:5173',AUTH_ENABLED:'true',PUBLIC_REGISTRATION_ENABLED:'true',SESSION_SECRET:'opening-regression-test-secret-32-characters',DATA_SOURCE:'postgres',CRM_SOURCE:'postgres'});
  const {app}=await import('../src/index.js');
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const post=async(route:string,body:unknown,cookie?:string)=>{
   const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:5173',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
   return {status:response.status,body:await response.json() as Record<string,any>,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const register=await post('/auth/register',{firstName:'Test',lastName:'Balances',dni:'30333111',phone:'1123456789',email:'opening@test.invalid',password:'OpeningTest123!',club:{name:'Opening test'}});
  assert.equal(register.status,201,JSON.stringify(register.body));
  const login=await post('/auth/login',{username:'opening@test.invalid',password:'OpeningTest123!'});
  assert.equal(login.status,200,JSON.stringify(login.body));assert.ok(login.cookie);
  const club=(await db.query<{id:string}>('select id from miclub.clubs')).rows[0].id;
  const draft={contractVersion:2,idempotencyKey:'opening-complete-regression',selectedPlanCode:'CLUB',
   openingBalances:{currency:'ARS',cash:100000,bank:200000,usdCash:0},
   sectors:PROVISIONED_ONBOARDING_SECTORS.map(s=>({...s,color:'#2563EB',status:'active',capacityMode:'INCOME',configuredCapacity:null})),workers:[],activities:[]};
  await t.test('completes and replays without duplicating capital or sequences',async()=>{
   const completed=await post('/api/onboarding/complete',{draft,selectedPlanCode:draft.selectedPlanCode},login.cookie);
   assert.equal(completed.status,200,JSON.stringify(completed.body));
   assert.equal(completed.body.state.status,'COMPLETED');
   const repeated=await post('/api/onboarding/complete',{draft,selectedPlanCode:draft.selectedPlanCode},login.cookie);
   assert.equal(repeated.status,200);assert.deepEqual(repeated.body,completed.body);
   const rows=(await db.query('select sequence_number::int,amount::text,operational_status from miclub.movements order by sequence_number')).rows;
   assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.sequence_number),[1,2,3]);
   assert.ok(rows.every(r=>r.operational_status==='COMPLETADO'));
  });
  await t.test('navigation and migration authorization agree for all plans and overrides',async()=>{
   const check=async(expected:boolean)=>{
    const nav=await fetch(base+'/api/modules/navigation',{headers:{cookie:login.cookie!}});
    assert.equal(nav.status,200);assert.equal(nav.headers.get('cache-control'),'private, no-store');
    assert.equal((await nav.json()).capabilities.some((c:{code:string})=>c.code==='DATA_MIGRATION'),expected);
    const template=await fetch(base+'/api/migration/template',{headers:{cookie:login.cookie!}});
    assert.equal(template.status,expected?200:403);
   };
   await check(true);
   for(const plan of ['FREE','SOCIAL','COMPLEX','CLUB']) {
    await db.query("update miclub.club_subscriptions set plan_code=$2 where club_id=$1 and effective_until is null",[club,plan]);
    await check(plan!=='FREE');
   }
   await db.query("insert into miclub.club_capabilities(club_id,capability,enabled,source,actor,effective_from,effective_until) values($1,'DATA_MIGRATION',false,'test','test',now(),now()+interval '1 day')",[club]);
   await check(false);
   await db.query("update miclub.club_capabilities set effective_until=now() where club_id=$1",[club]);
   await check(true);
   await db.query(await readFile('docs/dbeaver/2026-09-09-reservas-senas.sql','utf8'));
   assert.equal((await db.query("select count(*)::int as n from miclub.movement_categories mc join miclub.category_catalog cc on cc.id=mc.catalog_id where mc.club_id=$1 and cc.code in ('RESERVAS','SENAS')",[club])).rows[0].n,2);
  });
  await t.test('XLSX v3 dry-run and apply persist explicit activity with its sector',async()=>{
   const person=(await db.query('select id from miclub.people where club_id=$1 limit 1',[club])).rows[0].id;
   const sector=(await db.query('select id from miclub.sectors where club_id=$1 limit 1',[club])).rows[0].id;
   const instructor=(await db.query("insert into miclub.instructors(club_id,person_id,display_name) values($1,$2,'Profesor') returning id",[club,person])).rows[0].id;
   const activity=(await db.query("insert into miclub.activities(club_id,sector_id,instructor_id,name,code) values($1,$2,$3,'Yoga','YOGA') returning id",[club,sector,instructor])).rows[0].id;
   const workbook=workbookFixture({movementValues:{activity:'YOGA',category:'Reservas'},enrollmentValues:{activity:'Yoga'}});
   const upload=async(dry?:string)=>{
    const body=new FormData();body.append('file',new Blob([new Uint8Array(workbook)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'import.xlsx');
    if(dry)body.append('dryRunOfBatchId',dry);
    const response=await fetch(base+'/api/migration/uploads',{method:'POST',headers:{cookie:login.cookie!,origin:'http://localhost:5173'},body});
    return {status:response.status,body:await response.json()};
   };
   const dry=await upload();assert.equal(dry.status,200,JSON.stringify(dry.body));
   const otherSector=(await db.query('select id from miclub.sectors where club_id=$1 and id<>$2 limit 1',[club,sector])).rows[0].id;
   await db.query('update miclub.activities set sector_id=$2 where id=$1',[activity,otherSector]);
   assert.equal((await upload(dry.body.batchId)).status,409,'changed activity sector requires a new dry-run');
   await db.query('update miclub.activities set sector_id=$2 where id=$1',[activity,sector]);
   const applied=await upload(dry.body.batchId);assert.equal(applied.status,200,JSON.stringify(applied.body));
   const movement=(await db.query("select activity_id,sector_id,amount::text from miclub.movements where club_id=$1 and source='xlsx_import'",[club])).rows;
   assert.deepEqual(movement,[{activity_id:activity,sector_id:sector,amount:'1234.50'}]);
   assert.equal((await upload(dry.body.batchId)).status,409);
   const registerB=await post('/auth/register',{firstName:'Otro',lastName:'Club',dni:'30333222',phone:'1123456789',email:'other@test.invalid',password:'OpeningTest123!',club:{name:'Other test'}});
   assert.equal(registerB.status,201);
   const loginB=await post('/auth/login',{username:'other@test.invalid',password:'OpeningTest123!'});assert.equal(loginB.status,200);
   const clubB=(await db.query('select id from miclub.clubs where id<>$1',[club])).rows[0].id;
   await db.query("update miclub.club_subscriptions set plan_code='CLUB' where club_id=$1",[clubB]);
   const otherBody=new FormData();otherBody.append('file',new Blob([new Uint8Array(workbook)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'import.xlsx');
   const other=await fetch(base+'/api/migration/uploads',{method:'POST',headers:{cookie:loginB.cookie!,origin:'http://localhost:5173'},body:otherBody});
   assert.equal(other.status,422);
   assert.ok((await other.json()).errors.some((e:{error_code:string})=>e.error_code==='ACTIVITY_NOT_FOUND'));
   assert.equal((await db.query('select count(*)::int n from miclub.movements where club_id=$1',[clubB])).rows[0].n,0);
  });
  const runtime=new pg.Pool({connectionString:url.toString(),options:'-c role=miclub_runtime'}) as unknown as PgPool;
  const run=async(fn:(c:QueryExecutor)=>Promise<void>)=>{
   const c=await runtime.connect();try{await c.query('BEGIN');await c.query("select set_config('app.club_id',$1,true),set_config('app.current_club_id',$1,true)",[club]);await fn(c);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  };
  try{
   await t.test('replacement, reversal and zero balances reconcile under runtime RLS',async()=>{
    await run(async c=>{await c.query("select miclub.replace_opening_balances($1,'ARS',150000,250000,30,'replacement',null)",[club]);});
    const balances=(await db.query("select code,balance::text from miclub.v_financial_account_liquidity where club_id=$1 order by code",[club])).rows;
    assert.deepEqual(balances.map(r=>Number(r.balance)),[250000,150000,30]);
    await run(async c=>{await c.query("select miclub.reverse_opening_balances($1,'reverse',null)",[club]);});
    assert.ok((await db.query('select balance from miclub.v_financial_account_liquidity where club_id=$1',[club])).rows.every(r=>Number(r.balance)===0));
    // Fifteen opening/reversal entries plus the imported operational movement.
    assert.equal((await db.query('select count(*)::int n,count(distinct sequence_number)::int distinct_n from miclub.movements')).rows[0].n,16);
    assert.equal((await db.query('select count(distinct sequence_number)::int n from miclub.movements')).rows[0].n,16);
   });
   await t.test('ordinary negative movements and forged reversals remain forbidden',async()=>{
    await assert.rejects(run(async c=>{await c.query("insert into miclub.movements(club_id,sequence_number,movement_type,concept,amount) values($1,miclub.next_tenant_sequence($1,'movement'),'EGRESOS','Invalid',-1)",[club]);}),{code:'23514'});
    await assert.rejects(run(async c=>{await c.query("insert into miclub.movements(club_id,sequence_number,movement_type,concept,amount,account_id,source,source_payload) select $1,miclub.next_tenant_sequence($1,'movement'),'CAPITAL','Forged',-1,id,'onboarding','{\"operation\":\"REVERSE\"}'::jsonb from miclub.financial_accounts where club_id=$1 limit 1",[club]);}),{code:'23514'});
   });
   await t.test('a later failure rolls back accounts, batch, movements and sequence',async()=>{
    const before=(await db.query("select last_value::int from miclub.tenant_sequences where club_id=$1 and entity_type='movement'",[club])).rows[0];
    await assert.rejects(run(async c=>{await c.query("select miclub.replace_opening_balances($1,'ARS',10,20,0,'must-rollback',null)",[club]);throw new Error('later phase failed');}),/later phase failed/);
    assert.deepEqual((await db.query("select last_value::int from miclub.tenant_sequences where club_id=$1 and entity_type='movement'",[club])).rows[0],before);
    assert.equal((await db.query("select count(*)::int n from miclub.opening_balance_batches where idempotency_key='must-rollback'")).rows[0].n,0);
   });
  }finally{await runtime.end();}
 }finally{
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  const {closePostgresPool,closePostgresAdminPool}=await import('../src/db/postgres.js');
  await closePostgresPool();await closePostgresAdminPool();await db.end();
  await control.query(`drop database ${name} with (force)`);await control.end();
 }
});
