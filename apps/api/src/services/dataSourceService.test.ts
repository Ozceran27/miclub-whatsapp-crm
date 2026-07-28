import assert from "node:assert/strict";
import test from "node:test";
import { getDataSource, shouldUsePostgresDataSource } from "./dataSourceService.js";

test("los paneles ordinarios usan PostgreSQL aunque se configure una fuente legacy", () => {
  const previous = process.env.DATA_SOURCE;
  process.env.DATA_SOURCE = "legacy";
  try {
    assert.equal(getDataSource(), "postgres");
    assert.equal(shouldUsePostgresDataSource(), true);
  } finally {
    if (previous === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = previous;
  }
});
