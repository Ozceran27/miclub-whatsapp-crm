import { randomUUID } from "node:crypto";
import { isEconomyOperationalStatus } from '@miclub/shared';
import { withTenantTransaction } from "../../db/transaction.js";
import type { QueryExecutor } from "../../db/postgres.js";
import { auditService } from "../auditService.js";
import type { MigrationIssue, ParsedWorkbookRow } from "./validator.js";

export type ResolvedWorkbookRow = { sheet:string; rowNumber:number; sectorId:string|null; activityId:string|null; instructorId:string|null; categoryId:string|null; paymentMethodId:string|null; personId:string|null; accountId?:string|null; currencyCode?:string|null; externalReference:string|null; rowFingerprint:string };
export type WorkbookActor = { clubId:string; userId:string; membershipId:string; requestId?:string; ip?:string; userAgent?:string };
export type WorkbookInput = { actor:WorkbookActor; sha256:string; batchIdentity:string; templateVersion:string; sourceFile:string; idempotencyKey:string|null; referenceConfigHash:string; dryRunOfBatchId:string|null; rows:ParsedWorkbookRow[]; resolvedRows:ResolvedWorkbookRow[]; projectedWrites:number; errors:MigrationIssue[]; metadata:Record<string,unknown> };
type Dependencies={transaction:typeof withTenantTransaction; audit:typeof auditService.sensitiveChange};
const defaults:Dependencies={transaction:withTenantTransaction,audit:auditService.sensitiveChange};
const error=(code:string,message:string)=>Object.assign(new Error(message),{code});
const audit=(deps:Dependencies,input:WorkbookInput,batchId:string,action:string,result:"success"|"failure",counts:Record<string,unknown>,db?:QueryExecutor)=>deps.audit({action,result,userId:input.actor.userId,clubId:input.actor.clubId,membershipId:input.actor.membershipId,entityType:"xlsx_import_batch",entityId:batchId,requestId:input.actor.requestId,ip:input.actor.ip,userAgent:input.actor.userAgent,metadata:{batchId,source:"xlsx_import",...counts}},db);

async function insertErrors(db:QueryExecutor,input:WorkbookInput,batchId:string){
  for(const item of input.errors) await db.query(`insert into miclub.import_errors(batch_id,club_id,source_table,source_row,error_message,raw_payload,error_code,sheet,entity_type,field,value_normalized) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[batchId,input.actor.clubId,item.sheet??'xlsx_import',item.row_number==null?null:String(item.row_number),item.message,JSON.stringify({source:'xlsx_import',severity:item.severity,value_original:item.value_original??null}),item.error_code,item.sheet??null,item.entity_type??null,item.field??null,item.value_normalized??null]);
}

export async function dryRunWorkbook(input:WorkbookInput,deps:Dependencies=defaults){
  const batchId=randomUUID(); let errorCount=input.errors.filter((item)=>item.severity==="error").length;
  await audit(deps,input,batchId,"xlsx_import.started","success",{operation:"dry_run",rows:input.rows.length,projectedWrites:input.projectedWrites});
  await deps.transaction(input.actor.clubId,async(db)=>{
    for (const row of input.resolvedRows) {
      const existing = await db.query(`select r.entity_id from miclub.xlsx_import_rows r join miclub.import_batches b on b.id=r.batch_id and b.club_id=r.club_id where r.club_id=$1 and r.sheet=$2 and b.status='completed' and (r.row_fingerprint=$3 or ($4::text is not null and r.external_reference=$4)) limit 1`, [input.actor.clubId,row.sheet,row.rowFingerprint,row.externalReference]);
      if (existing.rows.length) input.errors.push({ error_code: 'IMPORT_SOURCE_ALREADY_EXISTS', message: 'Origen o fila completa previamente importado; revise la coincidencia.', severity: 'error', sheet: row.sheet, row_number: row.rowNumber });
    }
    errorCount=input.errors.filter(item=>item.severity==='error').length;
    await db.query(`insert into miclub.import_batches(id,source,source_file,status,club_id,file_sha256,batch_identity,operation_type,template_version,uploaded_by,row_count,error_count,projected_writes,persisted_writes,idempotency_key,reference_config_hash,metadata,finished_at) values($1,'xlsx_import',$2,$3,$4,$5,$6,'dry_run',$7,$8,$9,$10,$11,0,$12,$13,$14,now())`,[batchId,input.sourceFile,errorCount?'failed':'dry_run',input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.actor.userId,input.rows.length,errorCount,input.projectedWrites,input.idempotencyKey,input.referenceConfigHash,JSON.stringify(input.metadata)]);
    await insertErrors(db,input,batchId);
  });
  await audit(deps,input,batchId,errorCount?"xlsx_import.failed":"xlsx_import.completed_import_batch",errorCount?"failure":"success",{operation:"dry_run",rows:input.rows.length,errorCount,projectedWrites:input.projectedWrites});
  return {batchId,status:errorCount?"failed":"dry_run",dryRun:true,persistedWrites:0};
}

const enrollmentStatus=(value:unknown)=>{const key=String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_"); return ({activa:"al_dia",al_dia:"al_dia",nuevo_inscripto:"nuevo_inscripto",adeudando:"adeudando",abandonado:"abandonado",cancelada:"cancelado"} as Record<string,string>)[key]??"otro";};
const movementType=(value:unknown)=>{const key=String(value??"").trim().toUpperCase(); return key.startsWith("ING")?"INGRESOS":key.startsWith("EGR")?"EGRESOS":"CAPITAL";};
const movementStatus=(value:unknown)=>{
  const key=typeof value==='string'?value.trim().toUpperCase():'';
  if(!isEconomyOperationalStatus(key)) throw error('INVALID_MOVEMENT_STATUS','Estado operacional no reconocido.');
  return key;
};

export async function applyWorkbook(input:WorkbookInput,deps:Dependencies=defaults){
  if(input.errors.some((item)=>item.severity==="error")) throw error("WORKBOOK_HAS_ERRORS","No se puede aplicar un libro con errores.");
  if(!input.dryRunOfBatchId) throw error("MATCHING_DRY_RUN_REQUIRED","Se requiere el dry-run equivalente.");
  const batchId=randomUUID(); await audit(deps,input,batchId,"xlsx_import.started","success",{operation:"apply",rows:input.rows.length,projectedWrites:input.projectedWrites});
  try {
    const persistedWrites=await deps.transaction(input.actor.clubId,async(db)=>{
      await db.query('select miclub.finance_lock($1)', [input.actor.clubId]);
      await db.query("select set_config('app.finance_actor',$1,true),set_config('app.finance_reason',$2,true)", [input.actor.userId, `Importación XLSX: ${input.sourceFile}`]);
      const dry=await db.query(`select id from miclub.import_batches where id=$1 and club_id=$2 and file_sha256=$3 and batch_identity=$4 and template_version=$5 and reference_config_hash=$6 and status='dry_run' and error_count=0`,[input.dryRunOfBatchId,input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.referenceConfigHash]);
      if(!dry.rows.length) throw error("MATCHING_DRY_RUN_REQUIRED","El dry-run no coincide con archivo, versión, tenant, referencias y filas.");
      const duplicate=await db.query(`select id from miclub.import_batches where club_id=$1 and batch_identity=$2 and operation_type='apply' and status='completed'`,[input.actor.clubId,input.batchIdentity]);
      if(duplicate.rows.length) throw error("BATCH_ALREADY_EXECUTED","Este lote exacto ya fue completado.");
      for (const row of input.resolvedRows) {
        const existing = await db.query(`select r.entity_id from miclub.xlsx_import_rows r join miclub.import_batches b on b.id=r.batch_id and b.club_id=r.club_id where r.club_id=$1 and r.sheet=$2 and b.status='completed' and (r.row_fingerprint=$3 or ($4::text is not null and r.external_reference=$4)) limit 1`, [input.actor.clubId, row.sheet, row.rowFingerprint, row.externalReference]);
        if (existing.rows.length) throw error('IMPORT_SOURCE_ALREADY_EXISTS', `${row.sheet}, fila ${row.rowNumber}: el origen o la fila completa ya fue importado. Revise la coincidencia; no se duplicó ningún dato.`);
      }
      await db.query(`insert into miclub.import_batches(id,source,source_file,status,club_id,file_sha256,batch_identity,operation_type,template_version,uploaded_by,dry_run_of_batch_id,row_count,error_count,projected_writes,persisted_writes,idempotency_key,reference_config_hash,metadata) values($1,'xlsx_import',$2,'running',$3,$4,$5,'apply',$6,$7,$8,$9,0,$10,0,$11,$12,$13)`,[batchId,input.sourceFile,input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.actor.userId,input.dryRunOfBatchId,input.rows.length,input.projectedWrites,input.idempotencyKey,input.referenceConfigHash,JSON.stringify(input.metadata)]);
      let writes=0;
      // Materialize people first so ADMINISTRACIÓN can link a payment by DNI
      // even when its corresponding enrollment is new in this same workbook.
      for(const row of input.rows.filter((candidate)=>candidate.sheet==="INSCRIPCIONES")) await db.query(`insert into miclub.people(club_id,first_name,last_name,dni,phone) values($1,$2,$3,$4,$5) on conflict (club_id,normalized_dni) where normalized_dni is not null do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=coalesce(excluded.phone,miclub.people.phone),updated_at=now()`,[input.actor.clubId,row.values.firstName,row.values.lastName,String(row.values.document),row.values.phone]);
      for(const row of input.rows){
        const resolved=input.resolvedRows.find((item)=>item.sheet===row.sheet&&item.rowNumber===row.rowNumber); if(!resolved) throw error("UNRESOLVED_ROW",`Fila sin resolución: ${row.sheet} ${row.rowNumber}`);
        let entityId:string;
        if(row.sheet==="ADMINISTRACIÓN"){
          if(!resolved.categoryId) throw error("UNRESOLVED_ROW",`Categoría no resuelta en fila ${row.rowNumber}`);
          if (!resolved.accountId || !resolved.currencyCode) throw error('UNRESOLVED_ROW', `Cuenta no resuelta en fila ${row.rowNumber}`);
          const result=await db.query<{id:string}>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,category_id,sector_id,concept,person_id,counterparty_text,amount,taxes,payment_method_id,financial_status,operational_status,source,source_payload,activity_id,account_id,currency_code) values($1,miclub.next_tenant_sequence($1,'movement'),$2,$3::date at time zone (select coalesce(timezone,'America/Argentina/Buenos_Aires') from miclub.clubs where id=$1),$4::miclub.movement_type,$5,$6,$7,coalesce($8,(select id from miclub.people where club_id=$1 and dni=$9 limit 1)),$9,$10,$11,$12,'otro',$13::miclub.movement_status,'xlsx_import',$14,$15,$16,$17) returning id`,[input.actor.clubId,resolved.externalReference??`xlsx:${resolved.rowFingerprint}`,row.values.date,movementType(row.values.type),resolved.categoryId,resolved.sectorId,row.values.concept,resolved.personId,row.values.counterparty,row.values.amount,row.values.taxes??0,resolved.paymentMethodId,movementStatus(row.values.status),JSON.stringify({sheet:row.sheet,rowNumber:row.rowNumber,fingerprint:resolved.rowFingerprint}),resolved.activityId,resolved.accountId,resolved.currencyCode]); entityId=result.rows[0].id;
        } else if (row.sheet === 'SALDOS_INICIALES') {
          const person = (await db.query<{id:string}>("select id from miclub.people where club_id=$1 and normalized_dni=nullif(regexp_replace($2,'[^0-9]','','g'),'')", [input.actor.clubId, String(row.values.document)])).rows[0];
          if (!person) throw error('UNRESOLVED_ROW', `Persona de saldo inicial no encontrada, fila ${row.rowNumber}`);
          const result = await db.query<{id:string}>(`insert into miclub.initial_obligations(club_id,person_id,activity_id,kind,currency_code,amount,source_key,due_date,review_state) values($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT') returning id`, [input.actor.clubId, person.id, resolved.activityId, row.values.kind, row.values.currency, row.values.amount, resolved.externalReference, row.values.date]);
          entityId = result.rows[0].id;
        } else {
          if(!resolved.activityId||!resolved.instructorId) throw error("UNRESOLVED_ROW",`Actividad o instructor derivado no resuelto en fila ${row.rowNumber}`);
          const person=await db.query<{id:string}>(`insert into miclub.people(club_id,first_name,last_name,dni,phone) values($1,$2,$3,$4,$5) on conflict (club_id,normalized_dni) where normalized_dni is not null do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=coalesce(excluded.phone,miclub.people.phone),updated_at=now() returning id`,[input.actor.clubId,row.values.firstName,row.values.lastName,String(row.values.document),row.values.phone]);
          const result=await db.query<{id:string}>(`insert into miclub.enrollments(club_id,sequence_number,external_id,person_id,activity_id,fee_amount,modality,status,status_override,due_date,enrollment_date,source,notes) values($1,miclub.next_tenant_sequence($1,'enrollment'),$2,$3,$4,$5,$6,$7::miclub.enrollment_status,$8,null,$9,'xlsx_import',$10) returning id`,[input.actor.clubId,resolved.externalReference??`xlsx:${resolved.rowFingerprint}`,person.rows[0].id,resolved.activityId,row.values.fee,row.values.modality,enrollmentStatus(row.values.status),["abandonado","cancelado"].includes(enrollmentStatus(row.values.status)),row.values.date,JSON.stringify({sheet:row.sheet,rowNumber:row.rowNumber,fingerprint:resolved.rowFingerprint,instructorId:resolved.instructorId})]); entityId=result.rows[0].id;
        }
        await db.query(`insert into miclub.xlsx_import_rows(club_id,batch_id,sheet,row_fingerprint,external_reference,source_row_number,entity_id) values($1,$2,$3,$4,$5,$6,$7)`,[input.actor.clubId,batchId,row.sheet,resolved.rowFingerprint,resolved.externalReference,row.rowNumber,entityId]); writes+=2;
      }
      await db.query(`update miclub.finance_startups s set status='REQUIRES_REVIEW',revision=revision+1
        where s.club_id=$1 and s.approved_snapshot is not null and exists(select 1 from miclub.xlsx_import_rows r
        join miclub.movements m on m.id=r.entity_id and m.club_id=r.club_id join miclub.clubs c on c.id=m.club_id
        where r.club_id=s.club_id and r.batch_id=$2 and r.sheet='ADMINISTRACIÓN'
        and (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date<=s.cutoff_date)`, [input.actor.clubId,batchId]);
      await db.query(`update miclub.import_batches set status='completed',persisted_writes=$3,finished_at=now() where id=$1 and club_id=$2`,[batchId,input.actor.clubId,writes]);
      await audit(deps,input,batchId,"xlsx_import.completed_import_batch","success",{operation:"apply",batchState:"completed_import_batch",rows:input.rows.length,persistedWrites:writes},db);
      return writes;
    });
    return {batchId,status:"completed",dryRun:false,persistedWrites};
  } catch(cause){ await audit(deps,input,batchId,"xlsx_import.failed","failure",{operation:"apply",rows:input.rows.length,errorCode:typeof cause==='object'&&cause&&'code'in cause?String(cause.code):"APPLY_FAILED"}); throw cause; }
}
