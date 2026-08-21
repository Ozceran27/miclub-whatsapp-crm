import type { getPostgresPool } from "../db/postgres.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export type ImportBatchStatus = "pending" | "running" | "completed" | "completed_with_errors" | "failed" | "failed_configuration" | "dry_run";

export type ImportSchemaPreflightDetail = {
  entity: "movements" | "enrollments" | "operational_balances" | "payment_methods" | "instructors" | "activities";
  requiredConflictTarget: string[];
  requiredPredicate: string | null;
  compatibleConstraintFound: boolean;
};

/**
 * PostgreSQL only accepts ON CONFLICT arbiters backed by ready, valid UNIQUE
 * indexes. Check every importer-owned index in the live catalog before the
 * simulation starts, including writes that happen before the source rows.
 */
export const inspectImportConflictTargets = async (pool: Pick<Pool, "query">): Promise<ImportSchemaPreflightDetail[]> => {
  const result = await pool.query<{ table_name: string; target: string[]; predicate: string | null; compatible: boolean }>(
    `with required(table_name, index_name, target, predicate) as (values
       ('activities'::text, 'activities_import_conflict_key'::text, array['club_id','sector_id','lower(name)','coalesce(modality, ''''::text)'], null::text),
       ('enrollments', 'enrollments_club_external_id_key', array['club_id','external_id'], 'external_id IS NOT NULL'),
       ('instructors', 'instructors_import_conflict_key', array['club_id','person_id'], null),
       ('movements', 'movements_club_external_id_key', array['club_id','external_id'], 'external_id IS NOT NULL'),
       ('operational_balances', 'operational_balances_club_source_cutoff_key', array['club_id','source','cutoff_date'], null),
       ('payment_methods', 'payment_methods_club_normalized_name_key', array['club_id','lower(name)'], null)
     )
     select required.table_name, required.target, required.predicate,
            coalesce(i.indisunique and i.indisvalid and i.indisready, false) as compatible
       from required
       left join pg_class idx on idx.oid = to_regclass('miclub.' || required.index_name)
       left join pg_index i on i.indexrelid = idx.oid
      order by required.table_name`,
  );
  return result.rows.map((row) => ({
    entity: row.table_name as ImportSchemaPreflightDetail["entity"],
    requiredConflictTarget: row.target,
    requiredPredicate: row.predicate,
    compatibleConstraintFound: row.compatible,
  }));
};

export const createImportBatch = async (pool: Pool, input: { clubId: string; source: string; sourceFile?: string; dryRun: boolean; notes?: string }): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `insert into miclub.import_batches (club_id, source, source_file, status, notes)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [input.clubId, input.source, input.sourceFile ?? null, "running", input.notes ?? null]
  );
  return result.rows[0]?.id ?? "";
};

export const finishImportBatch = async (pool: Pool, clubId: string, batchId: string, status: ImportBatchStatus, notes?: string): Promise<void> => {
  await pool.query(`update miclub.import_batches set status = $3, finished_at = now(), notes = coalesce($4, notes) where club_id = $1 and id = $2`, [clubId, batchId, status, notes ?? null]);
};

export const hasRecentSuccessfulDryRun = async (pool: Pool, clubId: string, maxAgeMinutes = 30): Promise<boolean> => {
  const result = await pool.query<{ valid: boolean }>(
    `select exists (
       select 1 from miclub.import_batches
        where club_id = $1 and source = 'xlsx_import' and status = 'dry_run'
          and finished_at >= now() - make_interval(mins => $2)
          and notes like '{%'
          and coalesce((notes::jsonb ->> 'errors')::int, 1) = 0
     ) as valid`,
    [clubId, maxAgeMinutes],
  );
  return result.rows[0]?.valid === true;
};

export const logImportError = async (pool: Pool, input: { clubId: string; batchId: string; sourceTable: string; sourceRow: string; error: unknown; rawPayload?: unknown }): Promise<void> => {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await pool.query(
    `insert into miclub.import_errors (club_id, batch_id, source_table, source_row, error_message, raw_payload)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.clubId, input.batchId, input.sourceTable, input.sourceRow, message, JSON.stringify(input.rawPayload ?? null)]
  );
};

const errorCodeSql = `case
  when error_message ilike '%no unique or exclusion constraint matching the on conflict specification%'
    or error_message ilike '%no hay restricción única o de exclusión que coincida con la especificación on conflict%'
    then 'IMPORT_SCHEMA_CONFLICT_CONFIGURATION'
  when error_message ilike '%25P02%' or error_message ilike '%current transaction is aborted%' then 'TRANSACTION_ABORTED'
  when error_message ilike '%invalid%date%' or error_message ilike '%fecha%inválid%' then 'INVALID_DATE'
  when error_message ilike '%not-null%' or error_message ilike '%sin nombre%' then 'REQUIRED_FIELD'
  when error_message ilike '%foreign key%' then 'FOREIGN_KEY'
  when error_message ilike '%duplicate%' or error_message ilike '%unique constraint%' then 'DUPLICATE_EXTERNAL_ID'
  when error_message ilike '%sector%' then 'UNKNOWN_SECTOR'
  when error_message ilike '%activit%' or error_message ilike '%actividad%' then 'UNKNOWN_ACTIVITY'
  else 'ROW_IMPORT_ERROR' end`;

const friendlyMessageSql = `case when (${errorCodeSql}) = 'IMPORT_SCHEMA_CONFLICT_CONFIGURATION'
  then 'La base de datos no posee la restricción única requerida por el importador.'
  else left(error_message, 500) end`;

export const listImportBatches = async (pool: Pool, clubId: string, limit: number, offset: number) => {
  const result = await pool.query(
    `select *, count(*) over() as total_count
     from miclub.import_batches
     where club_id = $1
     order by started_at desc, id desc
     limit $2 offset $3`,
    [clubId, limit, offset]
  );
  return result.rows;
};

export const listImportErrors = async (pool: Pool, clubId: string, batchId: string, limit: number, offset: number, filters: { sheet?: string; entityType?: string } = {}) => {
  const result = await pool.query(
    `select id, batch_id, club_id, source_table as entity_type,
            split_part(source_row, ':', 1) as sheet,
            nullif(split_part(source_row, ':', 2), '')::integer as row_number,
            ${errorCodeSql} as error_code,
            ${friendlyMessageSql} as message,
            case when (${errorCodeSql}) = 'IMPORT_SCHEMA_CONFLICT_CONFIGURATION'
              then jsonb_build_object('sourceIdentifier', source_row, 'probableCause', 'El ON CONFLICT no coincide con un índice UNIQUE o constraint de PostgreSQL.', 'suggestedAction', 'Aplicar y validar la migración de constraints multi-tenant.')
              else jsonb_build_object('sourceIdentifier', source_row) end as metadata,
            created_at, count(*) over() as total_count
     from miclub.import_errors
     where club_id = $1 and batch_id = $2
       and ($5::text is null or split_part(source_row, ':', 1) = $5)
       and ($6::text is null or source_table = $6)
     order by created_at asc, id asc
     limit $3 offset $4`,
    [clubId, batchId, limit, offset, filters.sheet ?? null, filters.entityType ?? null]
  );
  return result.rows;
};

export const summarizeImportErrors = async (pool: Pool, clubId: string, batchId: string) => {
  const result = await pool.query(
    `select ${errorCodeSql} as error_code, source_table as entity_type,
            split_part(source_row, ':', 1) as sheet,
            ${friendlyMessageSql} as message, count(*)::int as count
       from miclub.import_errors
      where club_id = $1 and batch_id = $2
      group by 1, 2, 3, 4
      order by count(*) desc, 1, 2, 3
      limit 100`,
    [clubId, batchId],
  );
  return result.rows;
};
