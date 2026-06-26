import type { getPostgresPool } from "../db/postgres.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export type ImportBatchStatus = "pending" | "running" | "completed" | "completed_with_errors" | "failed" | "dry_run";

export const createImportBatch = async (pool: Pool, input: { source: string; sourceFile?: string; dryRun: boolean; notes?: string }): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `insert into miclub.import_batches (source, source_file, status, notes)
     values ($1, $2, $3, $4)
     returning id`,
    [input.source, input.sourceFile ?? null, input.dryRun ? "dry_run" : "running", input.notes ?? null]
  );
  return result.rows[0]?.id ?? "";
};

export const finishImportBatch = async (pool: Pool, batchId: string, status: ImportBatchStatus, notes?: string): Promise<void> => {
  await pool.query(`update miclub.import_batches set status = $2, finished_at = now(), notes = coalesce($3, notes) where id = $1`, [batchId, status, notes ?? null]);
};

export const logImportError = async (pool: Pool, input: { batchId: string; sourceTable: string; sourceRow: string; error: unknown; rawPayload?: unknown }): Promise<void> => {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await pool.query(
    `insert into miclub.import_errors (batch_id, source_table, source_row, error_message, raw_payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [input.batchId, input.sourceTable, input.sourceRow, message, JSON.stringify(input.rawPayload ?? null)]
  );
};

export const listImportBatches = async (pool: Pool, limit: number, offset: number) => {
  const result = await pool.query(
    `select *, count(*) over() as total_count
     from miclub.import_batches
     order by started_at desc, id desc
     limit $1 offset $2`,
    [limit, offset]
  );
  return result.rows;
};

export const listImportErrors = async (pool: Pool, batchId: string, limit: number, offset: number) => {
  const result = await pool.query(
    `select *, count(*) over() as total_count
     from miclub.import_errors
     where batch_id = $1
     order by created_at asc, id asc
     limit $2 offset $3`,
    [batchId, limit, offset]
  );
  return result.rows;
};
