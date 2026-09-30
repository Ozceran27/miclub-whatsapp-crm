import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import type { PgPool } from '../db/postgres.js';
import { setPostgresPoolForTests } from '../db/postgres.js';
import { zip } from '../services/xlsxMigration/fixtures/workbookFixtures.js';
import { CRM_XLSX_HEADERS } from '../services/crmXlsxWorkbook.js';
import { createCrmXlsxRoutes } from './crmXlsxRoutes.js';

const clubA='11111111-1111-4111-8111-111111111111',clubB='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333',missing='44444444-4444-4444-8444-444444444444';
const cell=(address:string,value:string)=>`<c r="${address}" t="inlineStr"><is><t>${value}</t></is></c>`;
const workbook=zip({
  '[Content_Types].xml':'<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  'xl/workbook.xml':'<workbook xmlns:r="r"><sheets><sheet name="CONTACTOS_CRM" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':`<worksheet><sheetData><row r="1">${CRM_XLSX_HEADERS.map((v,i)=>cell(`${'ABCDEFGH'[i]}1`,v)).join('')}</row><row r="2">${['12345678','Ana','Perez','3764123456','Adeudando','Tenis','',''].map((v,i)=>v?cell(`${'ABCDEFGH'[i]}2`,v):'').join('')}</row><row r="14">${cell('K14','CRM_CONTACTOS_v1')}</row></sheetData></worksheet>`,
});
const upload=async(base:string,path:string,dryRunId?:string,data=workbook)=>{const form=new FormData();form.append('file',new Blob([new Uint8Array(data)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'CRM_CONTACTOS_v1.xlsx');if(dryRunId)form.append('dryRunId',dryRunId);return fetch(`${base}${path}`,{method:'POST',body:form});};

const serve=async(run:(base:string,queries:string[],setClub:(value:string)=>void,setPermissions:(value:string[])=>void,calls:Array<{sql:string;params?:unknown[]}> )=>Promise<void>,failInsert=false,changeActive=false,schemaReady=true)=>{
  let currentClub=clubA,permissions=['crm:read','crm:write','sectors:any'];const queries:string[]=[],calls:Array<{sql:string;params?:unknown[]}>=[];
  const fake:PgPool={query:async<T>(sql:string,params?:unknown[])=>{queries.push(sql);calls.push({sql,params});
    if(sql.includes('to_regclass'))return {rows:[{ready:schemaReady}] as T[]};
    if(sql.includes('select base_currency_code from miclub.clubs'))return {rows:[{base_currency_code:'ARS'}] as T[]};
    if(sql.includes("status='dry_run' and template_version"))return {rows:[{file_sha256:await import('node:crypto').then(({createHash})=>createHash('sha256').update(workbook).digest('hex')),row_count:1,base_batch_id:null}] as T[]};
    if(sql.includes('insert into miclub.crm_xlsx_batches'))return {rows:[{id}] as T[]};
    if(sql.includes('insert into miclub.crm_xlsx_contacts')&&failInsert)throw new Error('forced insert failure');
    if(sql.includes("select id from miclub.crm_xlsx_batches where club_id=$1 and status='active'"))return {rows:(changeActive&&queries.filter(q=>q===sql).length>1?[{id:missing}]:[]) as T[]};
    if(sql.includes('from miclub.crm_xlsx_messages m')&&sql.includes('for update of m'))return {rows:[{id,status:'prepared',phone:'5493764123456',active_phone:'5493764999999',active_contact_id:id,active_status:'adeudando',name:'Ana Perez',active_first_name:'Ana',active_last_name:'Perez',activity:'Tenis',active_activity:'Tenis',stored_enrollment_date:null,active_enrollment_date:null,stored_due_date:null,active_due_date:null}] as T[]};
    if(sql.includes("from miclub.crm_xlsx_contacts c join")&&sql.includes('c.id=any'))return {rows:(params?.[0]===clubA?[{id,batchId:id,sourceRow:2,document:'12345678',contactKey:'12345678:tenis',firstName:'Ana',lastName:'Perez',phone:'5493764123456',status:'adeudando',activity:'Tenis',enrollmentDate:null,dueDate:null}]:[]) as T[]};
    return {rows:[] as T[]};},connect:()=>Promise.resolve({query:fake.query,release:()=>undefined}),end:()=>Promise.resolve()};
  setPostgresPoolForTests(fake);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.auth={clubId:currentClub,userId:clubA,membershipId:id,permissions,sectorIds:[],role:'DIRECTOR',email:'test@example.invalid',legacy:false,personId:id};next();});app.use(createCrmXlsxRoutes());app.use((_err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({message:'error'}));
  const server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});const address=server.address();assert.ok(address&&typeof address==='object');
  try{await run(`http://127.0.0.1:${address.port}`,queries,v=>{currentClub=v;},v=>{permissions=v;},calls);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));setPostgresPoolForTests(undefined);}
};

void test('el área exige CRM y alcance global incluso para lectura y cargas',async()=>serve(async(base,_q,_club,permissions)=>{
  permissions(['crm:read']);assert.equal((await fetch(`${base}/summary`)).status,403);
  permissions(['sectors:any']);assert.equal((await fetch(`${base}/summary`)).status,403);
  permissions(['crm:read','sectors:any']);assert.equal((await upload(base,'/dry-run')).status,403);
  permissions(['crm:write','sectors:any']);assert.equal((await fetch(`${base}/summary`)).status,403);assert.equal((await upload(base,'/dry-run')).status,200);
}));

void test('la plantilla se descarga y el esquema ausente se explica con 503',async()=>serve(async(base)=>{
  assert.equal((await fetch(`${base}/template`)).status,200);
  const response=await fetch(`${base}/summary`);
  assert.equal(response.status,503);
  assert.match((await response.json() as {message:string}).message,/DBeaver/);
},false,false,false));

void test('la validación devuelve mensaje legible y errores por fila en lugar de HTTP 422 genérico',async()=>serve(async(base,queries)=>{
  const response=await upload(base,'/dry-run',undefined,Buffer.from('archivo inválido'));
  assert.equal(response.status,422);
  const payload=await response.json() as {message:string;issues:Array<{field:string}>};
  assert.match(payload.message,/planilla tiene/);
  assert.ok(payload.issues.length>0);
  assert.equal(queries.filter(query=>query.includes('insert into miclub.crm_xlsx_batches')).length,0);
}));

void test('el filtro acepta Nuevo Inscripto y rechaza el estado retirado',async()=>serve(async(base)=>{
  assert.equal((await fetch(`${base}/contacts?status=nuevo_inscripto`)).status,200);
  assert.equal((await fetch(`${base}/contacts?status=no_inscripto`)).status,400);
}));

void test('orden importado valida columnas y se aplica antes de paginar dentro del club',async()=>serve(async(base,queries,setClub)=>{
  assert.equal((await fetch(`${base}/contacts?page=2&sortBy=dueDate&sortDirection=desc`)).status,200);
  assert.match(queries.find(q=>q.includes('limit 20 offset $4'))??'',/order by c.due_date desc nulls last,c.id limit 20 offset \$4/);
  assert.equal((await fetch(`${base}/messages?pending=false&sortBy=template&sortDirection=asc`)).status,200);
  assert.match(queries.find(q=>q.includes('limit 20 offset $2'))??'',/order by coalesce\(nullif\(trim\(m.template_name\),''\),'Mensaje personalizado'\) asc nulls last,m.id asc limit 20 offset \$2/);
  assert.equal((await fetch(`${base}/contacts?sortBy=unknown`)).status,400);
  assert.equal((await fetch(`${base}/messages?sortDirection=desc`)).status,400);
  setClub(clubB);
  assert.equal((await fetch(`${base}/contacts?sortBy=name`)).status,200);
  assert.ok(queries.some(q=>q.includes('where c.club_id=$1')&&q.includes('order by c.last_name asc nulls last,c.first_name asc nulls last,c.id')));
}));

void test('historial enviado filtra solo confirmados y ordena por fecha de confirmación',async()=>serve(async(base,queries,setClub,_permissions,calls)=>{
  const response=await fetch(`${base}/messages?pending=false&status=sent_manual&page=2`);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{items:[],total:0,page:2,pageSize:20});
  const count=queries.find(q=>q.includes('count(*)::int total from miclub.crm_xlsx_messages m'))??'';
  const rows=queries.find(q=>q.includes('from miclub.crm_xlsx_messages m left join'))??'';
  assert.match(count,/where m.club_id=\$1 and m.status='sent_manual'/);
  assert.match(rows,/where m.club_id=\$1 and m.status='sent_manual' order by m.sent_at desc nulls last,m.id desc limit 20 offset \$2/);
  assert.equal((await fetch(`${base}/messages?status=sent_manual&sortBy=date&sortDirection=asc`)).status,200);
  assert.ok(queries.some(q=>q.includes('order by m.sent_at asc nulls last,m.id asc limit 20 offset $2')));
  assert.equal((await fetch(`${base}/messages?pending=true&status=sent_manual`)).status,400);
  assert.equal((await fetch(`${base}/messages?status=skipped`)).status,400);
  assert.equal((await fetch(`${base}/messages?pending=false`)).status,200);
  assert.ok(queries.some(q=>q.includes('where m.club_id=$1  order by m.created_at desc,m.id desc')));
  setClub(clubB);
  assert.equal((await fetch(`${base}/messages?status=sent_manual`)).status,200);
  const tenantCounts=calls.filter(call=>call.sql.includes('count(*)::int total from miclub.crm_xlsx_messages m')&&call.sql.includes("m.status='sent_manual'"));
  assert.equal(tenantCounts[0].params?.[0],clubA);
  assert.equal(tenantCounts.at(-1)?.params?.[0],clubB);
}));

void test('dry-run y apply utilizan el club de sesión y hacen rollback ante un fallo de escritura',async()=>serve(async(base,queries)=>{
  const dry=await upload(base,'/dry-run');assert.equal(dry.status,200);const token=(await dry.json() as {dryRunId:string}).dryRunId;
  const applied=await upload(base,'/apply',token);assert.equal(applied.status,500);
  assert.ok(queries.some(q=>q.includes("status='replaced'")));assert.ok(queries.includes('ROLLBACK'));
  assert.equal(queries.at(-1),'ROLLBACK');
},true));

void test('selecciones ajenas o desaparecidas bloquean el lote completo',async()=>serve(async(base,queries,setClub)=>{
  const send=()=>fetch(`${base}/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contactIds:[id,missing],message:'Hola {nombre}'})});
  assert.equal((await send()).status,409);setClub(clubB);assert.equal((await send()).status,409);
  assert.equal(queries.filter(q=>q.includes('insert into miclub.crm_xlsx_messages')).length,0);
}));

void test('un preparado desactualizado no abre WhatsApp ni confirma envío',async()=>serve(async(base,queries)=>{
  assert.equal((await fetch(`${base}/messages/${id}/open`,{method:'POST'})).status,409);
  assert.equal((await fetch(`${base}/messages/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'sent_manual'})})).status,409);
  assert.equal(queries.filter(q=>q.includes("set status='opened'")||q.includes('set status=$3')).length,0);
}));

void test('una lista reemplazada entre dry-run y apply invalida la confirmación',async()=>serve(async(base,queries)=>{
  const dry=await upload(base,'/dry-run');assert.equal(dry.status,200);const token=(await dry.json() as {dryRunId:string}).dryRunId;
  assert.equal((await upload(base,'/apply',token)).status,409);
  assert.equal(queries.filter(q=>q.includes('insert into miclub.crm_xlsx_contacts')).length,0);
},false,true));
