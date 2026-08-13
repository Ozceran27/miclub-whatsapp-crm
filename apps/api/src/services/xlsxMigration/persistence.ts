import { withTenantTransaction } from "../../db/transaction.js";
import type { MigrationIssue } from "./validator.js";
export type SaveBatchInput = { clubId:string; userId:string; sha256:string; templateVersion:string; sourceFile:string; idempotencyKey:string|null; referenceConfigHash:string; dryRunOfBatchId:string|null; rows:number; projectedWrites:number; errors:MigrationIssue[]; metadata:Record<string,unknown> };
export async function saveBatch(input: SaveBatchInput) {
 return withTenantTransaction(input.clubId, async (db) => {
  if (input.dryRunOfBatchId) {
   const prior = await db.query<{id:string}>(`select id from miclub.import_batches where id=$1 and club_id=$2 and file_sha256=$3 and template_version=$4 and reference_config_hash=$5 and status='dry_run' and error_count=0`,[input.dryRunOfBatchId,input.clubId,input.sha256,input.templateVersion,input.referenceConfigHash]);
   if (prior.rows.length === 0) { const error=new Error("El import real requiere un dry-run exitoso del mismo archivo, versión, tenant y referencias.") as Error&{code:string}; error.code="MATCHING_DRY_RUN_REQUIRED"; throw error; }
  }
  const status=input.errors.length ? 'failed' : input.dryRunOfBatchId ? 'completed' : 'dry_run';
  const result=await db.query<{id:string}>(`insert into miclub.import_batches(source,source_file,status,club_id,file_sha256,template_version,uploaded_by,dry_run_of_batch_id,row_count,error_count,projected_writes,persisted_writes,idempotency_key,reference_config_hash,metadata,finished_at) values('xlsx',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()) on conflict(club_id,idempotency_key) where idempotency_key is not null do update set source_file=excluded.source_file returning id`,[input.sourceFile,status,input.clubId,input.sha256,input.templateVersion,input.userId,input.dryRunOfBatchId,input.rows,input.errors.length,input.projectedWrites,0,input.idempotencyKey,input.referenceConfigHash,JSON.stringify(input.metadata)]);
  const id=result.rows[0].id;
  for(const e of input.errors) await db.query(`insert into miclub.import_errors(batch_id,club_id,source,row_number,severity,message,details,error_code,sheet,entity_type,field,value_normalized) values($1,$2,'xlsx',$3,$4,$5,'{}',$6,$7,$8,$9,$10)`,[id,input.clubId,e.row_number??null,e.severity,e.message,e.error_code,e.sheet??null,e.entity_type??null,e.field??null,e.value_normalized??null]);
  return {batchId:id,status,dryRun:!input.dryRunOfBatchId};
 });
}
