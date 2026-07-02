import assert from "node:assert/strict";
import test from "node:test";
import { normalizePostgresSourceSheet, normalizeStatusLabel, normalizeSuspiciousArsAmount } from "./postgresDashboardService.js";

test("normalizePostgresSourceSheet reconoce nombres acentuados y variantes operativas", () => {
  assert.equal(normalizePostgresSourceSheet("Salón"), "SALON");
  assert.equal(normalizePostgresSourceSheet("LOCAL 1"), "LOCAL_1");
  assert.equal(normalizePostgresSourceSheet("Cantina"), "CANTINA");
  assert.equal(normalizePostgresSourceSheet("Espacio Fitness"), "FITNESS");
  assert.equal(normalizePostgresSourceSheet("Salón de Eventos"), "SALON");
  assert.equal(normalizePostgresSourceSheet("Aulas"), "AULA");
  assert.equal(normalizePostgresSourceSheet("Sector desconocido"), "ADMINISTRACION");
});

test("normalizeSuspiciousArsAmount corrige importes de cuotas inflados por mil", () => {
  assert.equal(normalizeSuspiciousArsAmount(25_000), 25_000);
  assert.equal(normalizeSuspiciousArsAmount(2_550_000_000), 2_550_000);
  assert.equal(normalizeSuspiciousArsAmount(-1_217_500_000), -1_217_500);
  assert.equal(normalizeSuspiciousArsAmount(1_234_567), 1_234_567);
});


test("normalizeStatusLabel respeta el estado explícito de la hoja para saldos", () => {
  assert.equal(normalizeStatusLabel("Nuevo Inscripto", "2026-01-01"), "Nuevo Inscripto");
  assert.equal(normalizeStatusLabel("Adeudando", "2026-12-31"), "Adeudando");
});
