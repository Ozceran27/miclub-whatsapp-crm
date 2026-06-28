import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostgresSourceSheet, normalizeSuspiciousArsAmount } from "./postgresDashboardService.js";

test("normalizePostgresSourceSheet reconoce nombres acentuados y variantes operativas", () => {
  assert.equal(normalizePostgresSourceSheet("Salón"), "SALON");
  assert.equal(normalizePostgresSourceSheet("LOCAL 1"), "LOCAL_1");
  assert.equal(normalizePostgresSourceSheet("Cantina"), "CANTINA");
  assert.equal(normalizePostgresSourceSheet("Espacio Fitness"), "FITNESS");
});

test("normalizeSuspiciousArsAmount corrige importes de cuotas inflados por mil", () => {
  assert.equal(normalizeSuspiciousArsAmount(25_000), 25_000);
  assert.equal(normalizeSuspiciousArsAmount(2_550_000_000), 2_550_000);
  assert.equal(normalizeSuspiciousArsAmount(-1_217_500_000), -1_217_500);
  assert.equal(normalizeSuspiciousArsAmount(1_234_567), 1_234_567);
});
