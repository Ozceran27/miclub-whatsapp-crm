import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostgresSourceSheet } from "./postgresDashboardService.js";

test("normalizePostgresSourceSheet reconoce nombres acentuados y variantes operativas", () => {
  assert.equal(normalizePostgresSourceSheet("Salón"), "SALON");
  assert.equal(normalizePostgresSourceSheet("LOCAL 1"), "LOCAL_1");
  assert.equal(normalizePostgresSourceSheet("Cantina"), "CANTINA");
  assert.equal(normalizePostgresSourceSheet("Espacio Fitness"), "FITNESS");
});
