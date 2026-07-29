import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { MAX_FILTER_LENGTH, MAX_LIST_LIMIT, parseListQuery } from "./listQuery.js";

const request = (query: Record<string, unknown>): Request => ({ query } as unknown as Request);

test("parseListQuery limita paginación y longitud de filtros", () => {
  const parsed = parseListQuery(request({ limit: "9999", offset: "20", status: `  ${"x".repeat(500)}  `, ignored: "value" }), ["status"]);
  assert.equal(parsed.limit, MAX_LIST_LIMIT);
  assert.equal(parsed.offset, 20);
  assert.equal(parsed.filters.status?.length, MAX_FILTER_LENGTH);
  assert.deepEqual(Object.keys(parsed.filters), ["status"]);
});

test("parseListQuery usa defaults seguros para números inválidos", () => {
  const parsed = parseListQuery(request({ limit: "-1", offset: "not-a-number" }), []);
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.offset, 0);
});
