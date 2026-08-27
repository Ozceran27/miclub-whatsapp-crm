import type { QueryExecutor } from './postgres.js';

/** Fail-fast gate for the exact schema required by atomic onboarding completion. */
export async function assertOnboardingSchema(db:QueryExecutor):Promise<void>{
 const result=await db.query<{operations_table:string|null;contract_column:string|null;result_column:string|null;import_link_column:string|null;operation_pk:string|null}>(`select
  to_regclass('miclub.onboarding_operations')::text operations_table,
  (select column_name from information_schema.columns where table_schema='miclub' and table_name='onboarding_operations' and column_name='contract_version') contract_column,
  (select column_name from information_schema.columns where table_schema='miclub' and table_name='onboarding_operations' and column_name='result') result_column,
  (select column_name from information_schema.columns where table_schema='miclub' and table_name='import_batches' and column_name='onboarding_completion_key') import_link_column,
  (select conname from pg_constraint where conrelid=to_regclass('miclub.onboarding_operations') and contype='p') operation_pk`);
 const missing=Object.entries(result.rows[0]??{}).filter(([,value])=>value===null).map(([name])=>name);
 if(missing.length)throw Object.assign(new Error(`Esquema de onboarding incompatible; ejecute migraciones. Faltan: ${missing.join(', ')}`),{code:'ONBOARDING_SCHEMA_UNAVAILABLE',status:503,expose:true});
}
