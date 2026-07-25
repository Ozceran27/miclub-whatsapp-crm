import type { getPostgresPool } from "../db/postgres.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export type ImportBatchStatus = "pending" | "running" | "completed" | "completed_with_errors" | "failed" | "dry_run";

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

export const logImportError = async (pool: Pool, input: { clubId: string; batchId: string; sourceTable: string; sourceRow: string; error: unknown; rawPayload?: unknown }): Promise<void> => {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await pool.query(
    `insert into miclub.import_errors (club_id, batch_id, source_table, source_row, error_message, raw_payload)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.clubId, input.batchId, input.sourceTable, input.sourceRow, message, JSON.stringify(input.rawPayload ?? null)]
  );
};

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

export const listImportErrors = async (pool: Pool, clubId: string, batchId: string, limit: number, offset: number) => {
  const result = await pool.query(
    `select *, count(*) over() as total_count
     from miclub.import_errors
     where club_id = $1 and batch_id = $2
     order by created_at asc, id asc
     limit $3 offset $4`,
    [clubId, batchId, limit, offset]
  );
  return result.rows;
};
