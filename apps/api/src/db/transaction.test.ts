import assert from "node:assert/strict";
import test from "node:test";
import { withTransaction } from "./transaction.js";
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
