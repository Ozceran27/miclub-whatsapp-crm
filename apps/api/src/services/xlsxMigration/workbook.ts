import { randomUUID } from "node:crypto";
import { withTenantTransaction } from "../../db/transaction.js";
import type { QueryExecutor } from "../../db/postgres.js";
import { auditService } from "../auditService.js";
import type { MigrationIssue, ParsedWorkbookRow } from "./validator.js";

export type ResolvedWorkbookRow = { sheet:string; rowNumber:number; sectorId:string|null; activityId:string|null; instructorId:string|null; categoryId:string|null; paymentMethodId:string|null; personId:string|null; externalReference:string|null; rowFingerprint:string };
export type WorkbookActor = { clubId:string; userId:string; membershipId:string; requestId?:string; ip?:string; userAgent?:string };
export type WorkbookInput = { actor:WorkbookActor; sha256:string; batchIdentity:string; templateVersion:string; sourceFile:string; idempotencyKey:string|null; referenceConfigHash:string; dryRunOfBatchId:string|null; rows:ParsedWorkbookRow[]; resolvedRows:ResolvedWorkbookRow[]; projectedWrites:number; errors:MigrationIssue[]; metadata:Record<string,unknown> };
type Dependencies={transaction:typeof withTenantTransaction; audit:typeof auditService.sensitiveChange};
const defaults:Dependencies={transaction:withTenantTransaction,audit:auditService.sensitiveChange};
const error=(code:string,message:string)=>Object.assign(new Error(message),{code});
const audit=(deps:Dependencies,input:WorkbookInput,batchId:string,action:string,result:"success"|"failure",counts:Record<string,unknown>,db?:QueryExecutor)=>deps.audit({action,result,userId:input.actor.userId,clubId:input.actor.clubId,membershipId:input.actor.membershipId,entityType:"xlsx_import_batch",entityId:batchId,requestId:input.actor.requestId,ip:input.actor.ip,userAgent:input.actor.userAgent,metadata:{batchId,...counts}},db);

async function insertErrors(db:QueryExecutor,input:WorkbookInput,batchId:string){
  for(const item of input.errors) await db.query(`insert into miclub.import_errors(batch_id,club_id,source,row_number,severity,message,details,error_code,sheet,entity_type,field,value_normalized) values($1,$2,'xlsx',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[batchId,input.actor.clubId,item.row_number??null,item.severity,item.message,JSON.stringify({value_original:item.value_original??null}),item.error_code,item.sheet??null,item.entity_type??null,item.field??null,item.value_normalized??null]);
}

export async function dryRunWorkbook(input:WorkbookInput,deps:Dependencies=defaults){
  const batchId=randomUUID(); const errorCount=input.errors.filter((item)=>item.severity==="error").length;
  await audit(deps,input,batchId,"xlsx.import.started","success",{operation:"dry_run",rows:input.rows.length,projectedWrites:input.projectedWrites});
  await deps.transaction(input.actor.clubId,async(db)=>{
    await db.query(`insert into miclub.import_batches(id,source,source_file,status,club_id,file_sha256,batch_identity,operation_type,template_version,uploaded_by,row_count,error_count,projected_writes,persisted_writes,idempotency_key,reference_config_hash,metadata,finished_at) values($1,'xlsx',$2,$3,$4,$5,$6,'dry_run',$7,$8,$9,$10,$11,0,$12,$13,$14,now())`,[batchId,input.sourceFile,errorCount?'failed':'dry_run',input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.actor.userId,input.rows.length,errorCount,input.projectedWrites,input.idempotencyKey,input.referenceConfigHash,JSON.stringify(input.metadata)]);
    await insertErrors(db,input,batchId);
  });
  await audit(deps,input,batchId,errorCount?"xlsx.import.failed":"xlsx.import.completed",errorCount?"failure":"success",{operation:"dry_run",rows:input.rows.length,errorCount,projectedWrites:input.projectedWrites});
  return {batchId,status:errorCount?"failed":"dry_run",dryRun:true,persistedWrites:0};
}

const enrollmentStatus=(value:unknown)=>{const key=String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_"); return ({activa:"al_dia",al_dia:"al_dia",nuevo_inscripto:"nuevo_inscripto",adeudando:"adeudando",abandonado:"abandonado",cancelada:"cancelado"} as Record<string,string>)[key]??"otro";};
const movementType=(value:unknown)=>{const key=String(value??"").trim().toUpperCase(); return key.startsWith("ING")?"INGRESOS":key.startsWith("EGR")?"EGRESOS":"CAPITAL";};
const movementStatus=(value:unknown)=>{const key=String(value??"").trim().toUpperCase(); return key.includes("PEND")?"PENDIENTE":key.includes("CANCEL")?"CANCELADO":"COMPLETADO";};

export async function applyWorkbook(input:WorkbookInput,deps:Dependencies=defaults){
  if(input.errors.some((item)=>item.severity==="error")) throw error("WORKBOOK_HAS_ERRORS","No se puede aplicar un libro con errores.");
  if(!input.dryRunOfBatchId) throw error("MATCHING_DRY_RUN_REQUIRED","Se requiere el dry-run equivalente.");
  const batchId=randomUUID(); await audit(deps,input,batchId,"xlsx.import.started","success",{operation:"apply",rows:input.rows.length,projectedWrites:input.projectedWrites});
  try {
    const persistedWrites=await deps.transaction(input.actor.clubId,async(db)=>{
      const dry=await db.query(`select id from miclub.import_batches where id=$1 and club_id=$2 and file_sha256=$3 and batch_identity=$4 and template_version=$5 and reference_config_hash=$6 and status='dry_run' and error_count=0`,[input.dryRunOfBatchId,input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.referenceConfigHash]);
      if(!dry.rows.length) throw error("MATCHING_DRY_RUN_REQUIRED","El dry-run no coincide con archivo, versión, tenant, referencias y filas.");
      const duplicate=await db.query(`select id from miclub.import_batches where club_id=$1 and batch_identity=$2 and operation_type='apply' and status='completed'`,[input.actor.clubId,input.batchIdentity]);
      if(duplicate.rows.length) throw error("BATCH_ALREADY_EXECUTED","Este lote exacto ya fue completado.");
      await db.query(`insert into miclub.import_batches(id,source,source_file,status,club_id,file_sha256,batch_identity,operation_type,template_version,uploaded_by,dry_run_of_batch_id,row_count,error_count,projected_writes,persisted_writes,idempotency_key,reference_config_hash,metadata) values($1,'xlsx',$2,'running',$3,$4,$5,'apply',$6,$7,$8,$9,0,$10,0,$11,$12,$13)`,[batchId,input.sourceFile,input.actor.clubId,input.sha256,input.batchIdentity,input.templateVersion,input.actor.userId,input.dryRunOfBatchId,input.rows.length,input.projectedWrites,input.idempotencyKey,input.referenceConfigHash,JSON.stringify(input.metadata)]);
      let writes=0;
      // Materialize people first so ADMINISTRACIÓN can link a payment by DNI
      // even when its corresponding enrollment is new in this same workbook.
      for(const row of input.rows.filter((candidate)=>candidate.sheet==="INSCRIPCIONES")) await db.query(`insert into miclub.people(club_id,first_name,last_name,dni,phone) values($1,$2,$3,$4,$5) on conflict (club_id,normalized_dni) where normalized_dni is not null do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=coalesce(excluded.phone,miclub.people.phone),updated_at=now()`,[input.actor.clubId,row.values.firstName,row.values.lastName,String(row.values.document),row.values.phone]);
      for(const row of input.rows){
        const resolved=input.resolvedRows.find((item)=>item.sheet===row.sheet&&item.rowNumber===row.rowNumber); if(!resolved) throw error("UNRESOLVED_ROW",`Fila sin resolución: ${row.sheet} ${row.rowNumber}`);
        let entityId:string;
        if(row.sheet==="ADMINISTRACIÓN"){
          if(!resolved.categoryId) throw error("UNRESOLVED_ROW",`Categoría no resuelta en fila ${row.rowNumber}`);
          const result=await db.query<{id:string}>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,category_id,sector_id,concept,person_id,counterparty_text,amount,taxes,payment_method_id,financial_status,operational_status,source,source_payload) values($1,miclub.next_tenant_sequence($1,'movement'),$2,$3,$4::miclub.movement_type,$5,$6,$7,coalesce($8,(select id from miclub.people where club_id=$1 and dni=$9 limit 1)),$9,$10,$11,$12,'otro',$13::miclub.movement_status,'xlsx',$14) returning id`,[input.actor.clubId,resolved.externalReference??`xlsx:${resolved.rowFingerprint}`,row.values.date,movementType(row.values.type),resolved.categoryId,resolved.sectorId,row.values.concept,resolved.personId,row.values.counterparty,row.values.amount,row.values.taxes??0,resolved.paymentMethodId,movementStatus(row.values.status),JSON.stringify({sheet:row.sheet,rowNumber:row.rowNumber,fingerprint:resolved.rowFingerprint})]); entityId=result.rows[0].id;
        } else {
          if(!resolved.activityId||!resolved.instructorId) throw error("UNRESOLVED_ROW",`Actividad o instructor derivado no resuelto en fila ${row.rowNumber}`);
          const person=await db.query<{id:string}>(`insert into miclub.people(club_id,first_name,last_name,dni,phone) values($1,$2,$3,$4,$5) on conflict (club_id,normalized_dni) where normalized_dni is not null do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=coalesce(excluded.phone,miclub.people.phone),updated_at=now() returning id`,[input.actor.clubId,row.values.firstName,row.values.lastName,String(row.values.document),row.values.phone]);
          const result=await db.query<{id:string}>(`insert into miclub.enrollments(club_id,sequence_number,external_id,person_id,activity_id,fee_amount,modality,status,status_override,due_date,enrollment_date,source,notes) values($1,miclub.next_tenant_sequence($1,'enrollment'),$2,$3,$4,$5,$6,$7::miclub.enrollment_status,$8,null,$9,'xlsx',$10) returning id`,[input.actor.clubId,resolved.externalReference??`xlsx:${resolved.rowFingerprint}`,person.rows[0].id,resolved.activityId,row.values.fee,row.values.modality,enrollmentStatus(row.values.status),["abandonado","cancelado"].includes(enrollmentStatus(row.values.status)),row.values.date,JSON.stringify({sheet:row.sheet,rowNumber:row.rowNumber,fingerprint:resolved.rowFingerprint,instructorId:resolved.instructorId})]); entityId=result.rows[0].id;
        }
        await db.query(`insert into miclub.xlsx_import_rows(club_id,batch_id,sheet,row_fingerprint,external_reference,source_row_number,entity_id) values($1,$2,$3,$4,$5,$6,$7)`,[input.actor.clubId,batchId,row.sheet,resolved.rowFingerprint,resolved.externalReference,row.rowNumber,entityId]); writes+=2;
      }
      await db.query(`update miclub.import_batches set status='completed',persisted_writes=$3,finished_at=now() where id=$1 and club_id=$2`,[batchId,input.actor.clubId,writes]);
      await audit(deps,input,batchId,"xlsx.import.completed","success",{operation:"apply",rows:input.rows.length,persistedWrites:writes},db);
      return writes;
    });
    return {batchId,status:"completed",dryRun:false,persistedWrites};
  } catch(cause){ await audit(deps,input,batchId,"xlsx.import.failed","failure",{operation:"apply",rows:input.rows.length,errorCode:typeof cause==='object'&&cause&&'code'in cause?String(cause.code):"APPLY_FAILED"}); throw cause; }
}
