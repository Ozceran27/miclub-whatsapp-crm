import path from 'node:path';
import { createRequire } from 'node:module';
import express, { Router, type Request, type Response } from 'express';
import { PERMISSIONS } from '@miclub/shared';
import { requireMembership, requirePermission } from '../middleware/authorization.js';
import { withTenantTransaction } from '../db/transaction.js';
import { buildWaLink } from '../services/messages.js';
import { CRM_XLSX_FILE, CRM_XLSX_VERSION, validateCrmXlsx, type CrmXlsxRow } from '../services/crmXlsxWorkbook.js';
import { XLSX_POLICY } from '../services/xlsxMigration/policy.js';
import { parseMultipartPart } from './multipartPart.js';

const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(res:Response,status:number,message:string)=>res.status(status).json({error:true,message});
const club=(req:Request)=>{if(!req.auth?.clubId)throw new Error('Tenant context missing');return req.auth.clubId;};
const page=(v:unknown)=>v===undefined?1:Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<=100000?Number(v):null;
const templatePath=path.join(path.dirname(createRequire(import.meta.url).resolve('@miclub/api/package.json')),'data/db',CRM_XLSX_FILE);
const allowed=new Set(['nombre','apellido','actividad','estado','fecha_inscripcion','fecha_vencimiento']);
const variables=(body:string)=>[...body.matchAll(/\{(\w+)\}/g)].map(m=>m[1].toLowerCase());
const validText=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const render=(body:string,row:CrmXlsxRow)=>{
  const values:Record<string,string>={nombre:row.firstName,apellido:row.lastName,actividad:row.activity??'',estado:'Adeudando',fecha_inscripcion:row.enrollmentDate??'',fecha_vencimiento:row.dueDate??''};
  return body.replace(/\{(\w+)\}/g,(_,key:string)=>values[key.toLowerCase()]??'');
};
const parseUpload=(req:Request)=>{
  const boundary=(req.get('content-type')??'').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
  if(!boundary||!Buffer.isBuffer(req.body))return null;
  const file=parseMultipartPart(req.body,boundary,'file');
  return file?.filename?file:null;
};
type Contact=CrmXlsxRow & {id:string;batchId:string};
const activeContactSql=`select c.id,c.batch_id "batchId",c.source_row "sourceRow",c.document,c.contact_key "contactKey",c.first_name "firstName",c.last_name "lastName",c.phone,c.status,c.activity,c.enrollment_date::text "enrollmentDate",c.due_date::text "dueDate"
  from miclub.crm_xlsx_contacts c join miclub.crm_xlsx_batches b on b.id=c.batch_id and b.club_id=c.club_id and b.status='active'
  where c.club_id=$1`;
const fetchSelected=async(db:import('../db/postgres.js').QueryExecutor,clubId:string,ids:string[])=>
  (await db.query<Contact>(`${activeContactSql} and c.id=any($2::uuid[]) and c.status='adeudando' order by c.id`,[clubId,ids])).rows;
const contactable=(rows:Contact[],ids:string[])=>rows.length===ids.length&&rows.every(row=>/^[1-9]\d{7,14}$/.test(row.phone));
const prepareInput=(body:Record<string,unknown>)=>{
  const ids=body.contactIds,message=body.message;
  return Array.isArray(ids)&&ids.length>0&&ids.length<=100&&ids.every(uuid)&&new Set(ids).size===ids.length&&validText(message,4000)&&variables(message as string).every(v=>allowed.has(v));
};
const currentMessageSql=`select m.*,m.enrollment_date::text stored_enrollment_date,m.due_date::text stored_due_date,c.id active_contact_id,c.phone active_phone,c.status active_status,c.first_name active_first_name,c.last_name active_last_name,c.activity active_activity,c.enrollment_date::text active_enrollment_date,c.due_date::text active_due_date
  from miclub.crm_xlsx_messages m
  left join miclub.crm_xlsx_contacts c on c.club_id=m.club_id and c.contact_key=m.contact_key
    and exists(select 1 from miclub.crm_xlsx_batches b where b.club_id=c.club_id and b.id=c.batch_id and b.status='active')
  where m.club_id=$1 and m.id=$2`;
const dateText=(value:unknown)=>typeof value==='string'?value:value instanceof Date?value.toISOString().slice(0,10):'';
const safeText=(value:unknown)=>typeof value==='string'?value:'';
const isFresh=(m:Record<string,unknown>)=>Boolean(m.active_contact_id)&&m.active_status==='adeudando'&&m.active_phone===m.phone
  &&`${safeText(m.active_first_name)} ${safeText(m.active_last_name)}`===m.name&&m.active_activity===m.activity
  &&dateText(m.active_enrollment_date)===dateText(m.stored_enrollment_date)&&dateText(m.active_due_date)===dateText(m.stored_due_date);
const contactSort={name:['c.last_name','c.first_name'],document:'c.document',phone:'c.phone',status:'c.status',activity:'c.activity',enrollmentDate:'c.enrollment_date',dueDate:'c.due_date'} as const;
const messageFreshSql=`c.id is not null and c.status='adeudando' and c.phone=m.phone and c.first_name||' '||c.last_name=m.name
  and c.activity is not distinct from m.activity and c.enrollment_date is not distinct from m.enrollment_date and c.due_date is not distinct from m.due_date`;
const messageSort={date:'m.created_at',name:'m.name',activity:'m.activity',status:'m.status',fresh:`(${messageFreshSql})`,template:"coalesce(nullif(trim(m.template_name),''),'Mensaje personalizado')"} as const;
const sortRequest=(query:Request['query'],fields:Record<string,string|readonly string[]>)=>{
  const key=query.sortBy,direction=query.sortDirection;
  if(key===undefined&&direction===undefined)return {order:null};
  if(typeof key!=='string'||!Object.hasOwn(fields,key)||direction!==undefined&&direction!=='asc'&&direction!=='desc')return null;
  const columns=Array.isArray(fields[key])?fields[key] as readonly string[]:[fields[key] as string];
  return {order:columns.map(field=>`${field} ${direction==='desc'?'desc':'asc'} nulls last`).join(',')};
};

export const createCrmXlsxRoutes=()=>{
  const router=Router();
  router.use(requireMembership,requirePermission(PERMISSIONS.SECTORS_ANY));
  router.use((req,res,next)=>requirePermission(req.method==='GET'?PERMISSIONS.CRM_READ:PERMISSIONS.CRM_WRITE)(req,res,next));
  router.use((_,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  const write=requirePermission(PERMISSIONS.CRM_WRITE);
  router.get('/template',(_req,res)=>{res.type(XLSX_POLICY.mime).set('X-Content-Type-Options','nosniff').set('Content-Disposition',`attachment; filename="${CRM_XLSX_FILE}"`).sendFile(templatePath);});
  router.use(async(req,res,next)=>{
    try{const ready=await withTenantTransaction(club(req),async db=>(await db.query<{ready:boolean}>(`select to_regclass('miclub.crm_xlsx_batches') is not null
      and to_regclass('miclub.crm_xlsx_contacts') is not null and to_regclass('miclub.crm_xlsx_templates') is not null
      and to_regclass('miclub.crm_xlsx_messages') is not null ready`)).rows[0]?.ready);
      if(!ready)return fail(res,503,'Falta instalar el esquema CRM XLSX en esta base de datos. Ejecutá y confirmá el script de DBeaver.');next();}catch(error){next(error);}
  });
  router.post('/dry-run',write,express.raw({type:'multipart/form-data',limit:'9mb'}),async(req,res,next)=>{
    const file=parseUpload(req);if(!file)return fail(res,400,'Se requiere un archivo XLSX.');
    try{const response=await withTenantTransaction(club(req),async db=>{
      const clubRow=(await db.query<{base_currency_code:string}>('select base_currency_code from miclub.clubs where id=$1 for update',[club(req)])).rows[0];
      if(!clubRow)throw Object.assign(new Error('Club no encontrado.'),{status:404});
      const result=validateCrmXlsx(file.data,file.filename!,file.mime??'',clubRow.base_currency_code);
      if(result.issues.length)return {issues:result.issues,rowCount:result.rows.length};
      const base=(await db.query<{id:string}>(`select id from miclub.crm_xlsx_batches where club_id=$1 and status='active'`,[club(req)])).rows[0]?.id??null;
      const inserted=await db.query<{id:string}>(`insert into miclub.crm_xlsx_batches(club_id,file_sha256,template_version,status,row_count,uploaded_by,base_batch_id)
        values($1,$2,$3,'dry_run',$4,$5,$6) returning id`,[club(req),result.sha256,CRM_XLSX_VERSION,result.rows.length,req.auth!.userId,base]);
      return {dryRunId:inserted.rows[0].id,rowCount:result.rows.length,preview:result.rows.slice(0,10),issues:[]};});
      if(response.issues.length)return res.status(422).json({message:`La planilla tiene ${response.issues.length} errores. Corregí las filas indicadas y volvé a validar.`,version:CRM_XLSX_VERSION,...response});
      res.json({version:CRM_XLSX_VERSION,...response});
    }catch(error){const status=(error as {status?:number}).status;if(status===404)return fail(res,404,(error as Error).message);next(error);}
  });
  router.post('/apply',write,express.raw({type:'multipart/form-data',limit:'9mb'}),async(req,res,next)=>{
    const file=parseUpload(req),boundary=(req.get('content-type')??'').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
    const dryRunId=boundary&&Buffer.isBuffer(req.body)?parseMultipartPart(req.body,boundary,'dryRunId')?.data.toString().trim():null;
    if(!file||!uuid(dryRunId))return fail(res,400,'Archivo y dryRunId válidos obligatorios.');
    try{const applied=await withTenantTransaction(club(req),async db=>{
      const clubRow=(await db.query<{base_currency_code:string}>('select base_currency_code from miclub.clubs where id=$1 for update',[club(req)])).rows[0];
      if(!clubRow)throw Object.assign(new Error('Club no encontrado.'),{status:404});
      const result=validateCrmXlsx(file.data,file.filename!,file.mime??'',clubRow.base_currency_code);
      if(result.issues.length)throw Object.assign(new Error(`La planilla tiene ${result.issues.length} errores. Corregí las filas indicadas y volvé a validar.`),{status:422,issues:result.issues});
      const dry=(await db.query<{file_sha256:string;row_count:number;base_batch_id:string|null}>(`select file_sha256,row_count,base_batch_id from miclub.crm_xlsx_batches
        where club_id=$1 and id=$2 and status='dry_run' and template_version=$3 for update`,[club(req),dryRunId,CRM_XLSX_VERSION])).rows[0];
      if(!dry||dry.file_sha256!==result.sha256||Number(dry.row_count)!==result.rows.length)throw Object.assign(new Error('El dry-run no corresponde al archivo actual.'),{status:409});
      const active=(await db.query<{id:string}>(`select id from miclub.crm_xlsx_batches where club_id=$1 and status='active'`,[club(req)])).rows[0]?.id??null;
      if(active!==dry.base_batch_id)throw Object.assign(new Error('La lista cambió desde la validación; validá de nuevo.'),{status:409});
      const replay=(await db.query(`select 1 from miclub.crm_xlsx_batches where club_id=$1 and file_sha256=$2 and status in ('active','replaced') limit 1`,[club(req),result.sha256])).rows.length;
      if(replay)throw Object.assign(new Error('Este archivo ya fue aplicado.'),{status:409});
      await db.query(`update miclub.crm_xlsx_batches set status='replaced' where club_id=$1 and status='active'`,[club(req)]);
      const batch=(await db.query<{id:string}>(`insert into miclub.crm_xlsx_batches(club_id,file_sha256,template_version,status,row_count,uploaded_by,dry_run_id,activated_at)
        values($1,$2,$3,'active',$4,$5,$6,now()) returning id`,[club(req),result.sha256,CRM_XLSX_VERSION,result.rows.length,req.auth!.userId,dryRunId])).rows[0];
      for(const row of result.rows)await db.query(`insert into miclub.crm_xlsx_contacts(club_id,batch_id,source_row,document,contact_key,first_name,last_name,phone,status,activity,enrollment_date,due_date)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[club(req),batch.id,row.sourceRow,row.document,row.contactKey,row.firstName,row.lastName,row.phone,row.status,row.activity,row.enrollmentDate,row.dueDate]);
      await db.query(`update miclub.crm_xlsx_batches set status='replaced' where club_id=$1 and id=$2`,[club(req),dryRunId]);
      return {batchId:batch.id,rowCount:result.rows.length};
    });res.json(applied);}catch(error){const status=(error as {status?:number}).status;if(status===409||status===404)return fail(res,status,(error as Error).message);if(status===422)return res.status(422).json({message:(error as Error).message,issues:(error as {issues:unknown}).issues});next(error);}
  });
  router.get('/summary',async(req,res,next)=>{try{const result=await withTenantTransaction(club(req),db=>db.query<{status:string;count:number}>(`
    select c.status,count(*)::int count from miclub.crm_xlsx_contacts c join miclub.crm_xlsx_batches b on b.club_id=c.club_id and b.id=c.batch_id and b.status='active'
    where c.club_id=$1 group by c.status`,[club(req)]));res.json({counts:Object.fromEntries(result.rows.map(r=>[r.status,r.count]))});}catch(error){next(error);}});
  router.get('/batches',async(req,res,next)=>{try{res.json((await withTenantTransaction(club(req),db=>db.query(`select id,status,row_count "rowCount",template_version "version",created_at "createdAt",activated_at "activatedAt"
    from miclub.crm_xlsx_batches where club_id=$1 and status in ('active','replaced') and dry_run_id is not null order by created_at desc,id desc limit 20`,[club(req)]))).rows);}catch(error){next(error);}});
  router.get('/contacts',async(req,res,next)=>{
    const currentPage=page(req.query.page),status=req.query.status,query=req.query.query;
    const sorting=sortRequest(req.query,contactSort);
    if(!currentPage||!sorting||(status!==undefined&&(typeof status!=='string'||!['al_dia','nuevo_inscripto','adeudando','abandonado'].includes(status)))||(query!==undefined&&(typeof query!=='string'||query.length>100)))return fail(res,400,'Filtros inválidos.');
    try{const response=await withTenantTransaction(club(req),async db=>{
      const params=[club(req),status??null,typeof query==='string'?query.trim():null];
      const filter=`and ($2::text is null or c.status=$2) and ($3::text is null or (c.first_name||' '||c.last_name||' '||c.document||' '||coalesce(c.activity,'')) ilike '%'||$3||'%')`;
      const count=(await db.query<{total:number}>(`select count(*)::int total from (${activeContactSql} ${filter}) x`,params)).rows[0]?.total??0;
      const items=(await db.query<Contact>(`${activeContactSql} ${filter} order by ${sorting.order??'c.last_name,c.first_name'},c.id limit 20 offset $4`,[...params,(currentPage-1)*20])).rows;
      return {items,total:count,page:currentPage,pageSize:20};
    });res.json(response);}catch(error){next(error);}
  });
  router.get('/templates',async(req,res,next)=>{try{res.json((await withTenantTransaction(club(req),db=>db.query(`select id,name,body from miclub.crm_xlsx_templates where club_id=$1 and archived_at is null order by created_at`,[club(req)]))).rows);}catch(error){next(error);}});
  router.post('/templates',write,async(req,res,next)=>{
    const {name,body}=req.body as {name?:unknown;body?:unknown};
    if(!validText(name,120)||!validText(body,4000)||variables(body as string).some(v=>!allowed.has(v)))return fail(res,400,'Plantilla o variables inválidas.');
    try{const row=(await withTenantTransaction(club(req),db=>db.query(`insert into miclub.crm_xlsx_templates(club_id,name,body) values($1,$2,$3) returning id,name,body`,[club(req),(name as string).trim(),(body as string).trim()]))).rows[0];res.status(201).json(row);}catch(error){next(error);}
  });
  router.patch('/templates/:id',write,async(req,res,next)=>{
    const {name,body}=req.body as {name?:unknown;body?:unknown};
    if(!uuid(req.params.id)||!validText(name,120)||!validText(body,4000)||variables(body as string).some(v=>!allowed.has(v)))return fail(res,400,'Plantilla inválida.');
    try{const row=(await withTenantTransaction(club(req),db=>db.query(`update miclub.crm_xlsx_templates set name=$3,body=$4,updated_at=now() where club_id=$1 and id=$2 and archived_at is null returning id,name,body`,[club(req),req.params.id,(name as string).trim(),(body as string).trim()]))).rows[0];if(!row)return fail(res,404,'Plantilla no encontrada.');res.json(row);}catch(error){next(error);}
  });
  router.delete('/templates/:id',write,async(req,res,next)=>{if(!uuid(req.params.id))return fail(res,400,'ID inválido.');try{const row=(await withTenantTransaction(club(req),db=>db.query(`update miclub.crm_xlsx_templates set archived_at=now() where club_id=$1 and id=$2 and archived_at is null returning id`,[club(req),req.params.id]))).rows[0];if(!row)return fail(res,404,'Plantilla no encontrada.');res.status(204).end();}catch(error){next(error);}});
  router.post('/prepare/preview',write,async(req,res,next)=>{
    const body=req.body as Record<string,unknown>;
    if(!prepareInput(body))return fail(res,400,'Selección, texto o variables inválidas.');
    try{const rows=await withTenantTransaction(club(req),db=>fetchSelected(db,club(req),body.contactIds as string[]));
      if(!contactable(rows,body.contactIds as string[]))return fail(res,409,'La selección cambió o contiene filas no contactables.');
      res.json({count:rows.length,sample:render(body.message as string,rows[0])});}catch(error){next(error);}
  });
  router.post('/prepare',write,async(req,res,next)=>{
    const body=req.body as Record<string,unknown>;
    if(!prepareInput(body))return fail(res,400,'Selección, texto o variables inválidas.');
    try{const result=await withTenantTransaction(club(req),async db=>{
      await db.query('select id from miclub.clubs where id=$1 for update',[club(req)]);
      const rows=await fetchSelected(db,club(req),body.contactIds as string[]);
      if(!contactable(rows,body.contactIds as string[]))throw Object.assign(new Error('La lista cambió; actualizala.'),{status:409});
      const inserted=[];
      for(const row of rows){const message=render(body.message as string,row);
        const created=(await db.query(`insert into miclub.crm_xlsx_messages(club_id,contact_id,contact_key,phone,enrollment_date,due_date,name,activity,message,wa_link,status,template_name)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'prepared',$11) returning id,status,created_at`,[club(req),row.id,row.contactKey,row.phone,row.enrollmentDate,row.dueDate,`${row.firstName} ${row.lastName}`,row.activity,message,buildWaLink(row.phone,message),typeof body.templateName==='string'?body.templateName.slice(0,120):null])).rows[0];inserted.push(created);}
      return inserted;
    });res.json(result);}catch(error){if((error as {status?:number}).status===409)return fail(res,409,(error as Error).message);next(error);}
  });
  router.get('/messages',async(req,res,next)=>{
    const currentPage=page(req.query.page),sorting=sortRequest(req.query,messageSort);if(!currentPage||!sorting)return fail(res,400,'Página u orden inválido.');
    const pending=req.query.pending==='true';
    try{const result=await withTenantTransaction(club(req),async db=>{
      const where=`where m.club_id=$1 ${pending?"and m.status in ('prepared','opened')":''}`;
      const total=(await db.query<{total:number}>(`select count(*)::int total from miclub.crm_xlsx_messages m ${where}`,[club(req)])).rows[0]?.total??0;
      const rows=(await db.query<Record<string,unknown>>(`select m.id,m.contact_id "contactId",m.name,m.activity,m.phone,m.message,m.wa_link "waLink",m.status,m.template_name "templateName",m.created_at "createdAt",m.opened_at "openedAt",m.sent_at "sentAt",m.contact_key,m.enrollment_date::text stored_enrollment_date,m.due_date::text stored_due_date,
        c.id active_contact_id,c.phone active_phone,c.status active_status,c.first_name active_first_name,c.last_name active_last_name,c.activity active_activity,c.enrollment_date::text active_enrollment_date,c.due_date::text active_due_date
        from miclub.crm_xlsx_messages m left join miclub.crm_xlsx_contacts c on c.club_id=m.club_id and c.contact_key=m.contact_key
          and exists(select 1 from miclub.crm_xlsx_batches b where b.club_id=c.club_id and b.id=c.batch_id and b.status='active')
        ${where} order by ${sorting.order??'m.created_at desc'},m.id ${sorting.order?'asc':'desc'} limit 20 offset $2`,[club(req),(currentPage-1)*20])).rows;
      return {items:rows.map(r=>({id:r.id,contactId:r.contactId,name:r.name,activity:r.activity,phone:r.phone,message:r.message,waLink:r.waLink,status:r.status,templateName:r.templateName,createdAt:r.createdAt,openedAt:r.openedAt,sentAt:r.sentAt,fresh:isFresh(r)})),total,page:currentPage,pageSize:20};
    });res.json(result);}catch(error){next(error);}
  });
  router.post('/messages/:id/open',write,async(req,res,next)=>{
    if(!uuid(req.params.id))return fail(res,400,'Mensaje inválido.');
    try{const response=await withTenantTransaction(club(req),async db=>{
      await db.query('select id from miclub.clubs where id=$1 for update',[club(req)]);
      const row=(await db.query<Record<string,unknown>>(`${currentMessageSql} for update of m`,[club(req),req.params.id])).rows[0];
      if(!row)return null;if(!['prepared','opened'].includes(String(row.status))||!isFresh(row))return {stale:true};
      await db.query(`update miclub.crm_xlsx_messages set status='opened',opened_at=coalesce(opened_at,now()) where club_id=$1 and id=$2`,[club(req),req.params.id]);
      return {waLink:row.wa_link};
    });if(!response)return fail(res,404,'Mensaje no encontrado.');if('stale'in response)return fail(res,409,'El contacto cambió. Prepará un mensaje nuevo.');res.json(response);}catch(error){next(error);}
  });
  router.patch('/messages/:id/status',write,async(req,res,next)=>{
    const nextStatus:unknown=(req.body as Record<string,unknown> | undefined)?.status;
    if(!uuid(req.params.id)||(nextStatus!=='sent_manual'&&nextStatus!=='skipped'))return fail(res,400,'Estado inválido.');
    try{const result=await withTenantTransaction(club(req),async db=>{
      await db.query('select id from miclub.clubs where id=$1 for update',[club(req)]);
      const message=(await db.query<Record<string,unknown>>(`${currentMessageSql} for update of m`,[club(req),req.params.id])).rows[0];
      if(!message)return null;
      if(nextStatus==='sent_manual'&&(!isFresh(message)||message.status!=='opened'))return {stale:true};
      if(!['prepared','opened'].includes(safeText(message.status)))return {stale:true};
      return (await db.query<{id:string;status:string}>(`update miclub.crm_xlsx_messages set status=$3,sent_at=case when $3='sent_manual' then now() else sent_at end
        where club_id=$1 and id=$2 returning id,status`,[club(req),req.params.id,nextStatus])).rows[0];
    });
      if(!result)return fail(res,404,'Mensaje no encontrado.');if('stale' in result)return fail(res,409,'El mensaje ya no admite esta confirmación.');res.json(result);}catch(error){next(error);}
  });
  return router;
};
