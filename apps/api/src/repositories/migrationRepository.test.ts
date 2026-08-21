import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../db/postgres.js";
import { isHistoricalCompletedGoogleSheetsImportBatch, normalizeHistoricalMissingReason } from "./legacyMigrationReadAdapter.js";
import { isCompletedXlsxImportBatch } from "./migrationRepository.js";

test("the operational batch lookup only accepts the canonical XLSX source", async () => {
  let statement = "";
  const executor = { query: async <T>(sql: string) => { statement = sql; return { rows: [{ id: "batch" }] as T[] }; } } as QueryExecutor;
  assert.equal(await isCompletedXlsxImportBatch(executor, "batch", "club"), true);
  assert.match(statement, /source = 'xlsx_import'/);
  assert.doesNotMatch(statement, /google_sheets/);
});

test("historical Google Sheets vocabulary is confined to the read-only legacy adapter", async () => {
  let statement = "";
  const executor = { query: async <T>(sql: string) => { statement = sql; return { rows: [] as T[] }; } } as QueryExecutor;
  assert.equal(await isHistoricalCompletedGoogleSheetsImportBatch(executor, "batch", "club"), false);
  assert.match(statement, /^select /);
  assert.match(statement, /source = 'google_sheets'/);
  assert.equal(normalizeHistoricalMissingReason("missing_from_google_sheets_import"), "missing_from_import_batch");
});
