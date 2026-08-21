import type { QueryExecutor } from "../db/postgres.js";

/**
 * Read-only adapter for rows written by the retired Google Sheets importer.
 * New runtime writes and mutation decisions must not depend on these values.
 */
export const isHistoricalCompletedGoogleSheetsImportBatch = async (
  executor: QueryExecutor,
  batchId: string,
  clubId: string,
): Promise<boolean> => {
  const result = await executor.query<{ id: string }>(
    "select id from miclub.import_batches where id = $1 and club_id = $2 and source = 'google_sheets' and status in ('completed', 'completed_with_errors')",
    [batchId, clubId],
  );
  return result.rows.length > 0;
};

export const normalizeHistoricalMissingReason = (reason: string | null): string | null =>
  reason === "missing_from_google_sheets_import" ? "missing_from_import_batch" : reason;
