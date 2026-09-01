import assert from "node:assert/strict";
import test from "node:test";
import { withTenantTransaction, withTransaction } from "./transaction.js";
import type { PgClient } from "./postgres.js";

const fixture = (callbackError?: Error) => {
  const queries: string[] = [];
  let releases = 0;
  const client: PgClient = {
    query: async <T>(sql: string) => {
      queries.push(sql);
      return { rows: [] as T[] };
    },
    release: () => { releases += 1; },
  };
  const pool = { connect: async () => client };
  const run = () => withTransaction(async () => {
    queries.push("work");
    if (callbackError) throw callbackError;
    return "done";
  }, pool);
  return { queries, releases: () => releases, run };
};

test("withTransaction confirma y libera el client", async () => {
  const subject = fixture();
  assert.equal(await subject.run(), "done");
  assert.deepEqual(subject.queries, ["BEGIN", "work", "COMMIT"]);
  assert.equal(subject.releases(), 1);
});

test("withTransaction revierte y libera el client ante un error", async () => {
  const failure = new Error("write failed");
  const subject = fixture(failure);
  await assert.rejects(subject.run(), failure);
  assert.deepEqual(subject.queries, ["BEGIN", "work", "ROLLBACK"]);
  assert.equal(subject.releases(), 1);
});

test("withTenantTransaction configura app.club_id local y parametrizado", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client: PgClient = {
    query: async <T>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [] as T[] };
    },
    release: () => undefined,
  };

  await withTenantTransaction("11111111-1111-4111-8111-111111111111", async (db) => {
    // Deliberately no club_id predicate: the integration SQL verifies RLS handles it.
    await db.query("SELECT id FROM miclub.people");
  }, { connect: async () => client });

  assert.deepEqual(queries, [
    { sql: "BEGIN", params: undefined },
    { sql: "SELECT set_config('app.club_id', $1, true)", params: ["11111111-1111-4111-8111-111111111111"] },
    { sql: "SELECT set_config('app.current_club_id', $1, true)", params: ["11111111-1111-4111-8111-111111111111"] },
    { sql: "SELECT id FROM miclub.people", params: undefined },
    { sql: "COMMIT", params: undefined },
  ]);
});
