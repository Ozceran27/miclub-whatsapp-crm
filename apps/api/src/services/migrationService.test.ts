import assert from "node:assert/strict";
import test from "node:test";
import type { PgClient } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { removeMissingEnrollments } from "./migrationService.js";

test("removeMissingEnrollments revierte la escritura cuando falla la auditoría", async () => {
  const transactionCommands: string[] = [];
  const enrollmentId = "22222222-2222-4222-8222-222222222222";
  let releases = 0;
  const client: PgClient = {
    query: async <T>(sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) transactionCommands.push(sql);
      if (sql.includes("from miclub.import_batches")) return { rows: [{ id: "batch" }] as T[] };
      if (sql.includes("from miclub.enrollments e")) return { rows: [{ id: enrollmentId, dependency_reason: null }] as T[] };
      if (sql.includes("delete from miclub.enrollments")) return { rows: [{ id: enrollmentId }] as T[] };
      return { rows: [] as T[] };
    },
    release: () => { releases += 1; },
  };
  const auditFailure = new Error("audit unavailable");

  await assert.rejects(removeMissingEnrollments(
    { importId: "11111111-1111-4111-8111-111111111111", enrollmentIds: [enrollmentId] },
    { clubId: "33333333-3333-4333-8333-333333333333", userId: "44444444-4444-4444-8444-444444444444", membershipId: "55555555-5555-4555-8555-555555555555" },
    {
      transaction: (callback) => withTransaction(callback, { connect: async () => client }),
      audit: async (_event, executor) => {
        assert.equal(executor, client, "repository and audit must share the transaction client");
        throw auditFailure;
      },
    },
  ), auditFailure);

  assert.deepEqual(transactionCommands, ["BEGIN", "ROLLBACK"]);
  assert.equal(releases, 1);
});
