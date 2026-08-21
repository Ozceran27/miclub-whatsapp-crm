import assert from "node:assert/strict";
import test from "node:test";
import type { PgClient } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { archiveEnrollmentsMissingFromImportBatch } from "./migrationService.js";

test("archiveEnrollmentsMissingFromImportBatch revierte la escritura cuando falla la auditoría", async () => {
  const transactionCommands: string[] = [];
  const enrollmentId = "22222222-2222-4222-8222-222222222222";
  let releases = 0;
  const client: PgClient = {
    query: async <T>(sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) transactionCommands.push(sql);
      if (sql.includes("from miclub.import_batches")) return { rows: [{ id: "batch" }] as T[] };
      if (sql.includes("from miclub.enrollments e")) return { rows: [{ id: enrollmentId, dependency_reason: null }] as T[] };
      if (sql.includes("update miclub.enrollments")) {
        assert.match(sql, /source = 'xlsx_import'/);
        assert.match(sql, /missing_from_import_batch/);
        assert.match(sql, /superseded_at = coalesce/);
        assert.match(sql, /status = 'cancelado'/);
        return { rows: [{ id: enrollmentId }] as T[] };
      }
      return { rows: [] as T[] };
    },
    release: () => { releases += 1; },
  };
  const auditFailure = new Error("audit unavailable");

  await assert.rejects(archiveEnrollmentsMissingFromImportBatch(
    { batchId: "11111111-1111-4111-8111-111111111111", enrollmentIds: [enrollmentId] },
    { clubId: "33333333-3333-4333-8333-333333333333", userId: "44444444-4444-4444-8444-444444444444", membershipId: "55555555-5555-4555-8555-555555555555" },
    {
      transaction: (callback) => withTransaction(callback, { connect: async () => client }),
      audit: async (event, executor) => {
        assert.equal(executor, client, "repository and audit must share the transaction client");
        assert.equal(event.action, "xlsx_import.enrollments.archive_missing");
        assert.equal(event.entityType, "xlsx_import_batch");
        assert.deepEqual(event.metadata, {
          requestedEnrollmentIds: [enrollmentId],
          archivedEnrollmentIds: [enrollmentId],
          importBatchId: "11111111-1111-4111-8111-111111111111",
          source: "xlsx_import",
          batchState: "completed_import_batch",
          reason: "missing_from_import_batch",
          skippedCount: 0,
        });
        throw auditFailure;
      },
    },
  ), auditFailure);

  assert.deepEqual(transactionCommands, ["BEGIN", "ROLLBACK"]);
  assert.equal(releases, 1);
});
