import assert from "node:assert/strict";
import test from "node:test";
import { calculateOperationalProjectedBalance, normalizePostgresSourceSheet, normalizeStatusLabel, normalizeSuspiciousArsAmount, normalizeSuspiciousMembershipFee } from "./postgresDashboardService.js";

test("normalizePostgresSourceSheet reconoce nombres acentuados y variantes operativas", () => {
  assert.equal(normalizePostgresSourceSheet("Salón"), "SALON");
  assert.equal(normalizePostgresSourceSheet("LOCAL 1"), "LOCAL_1");
  assert.equal(normalizePostgresSourceSheet("Cantina"), "CANTINA");
  assert.equal(normalizePostgresSourceSheet("Espacio Fitness"), "FITNESS");
  assert.equal(normalizePostgresSourceSheet("Salón de Eventos"), "SALON");
  assert.equal(normalizePostgresSourceSheet("Aulas"), "AULA");
  assert.equal(normalizePostgresSourceSheet("Sector desconocido"), "ADMINISTRACION");
});

test("normalizeSuspiciousArsAmount corrige importes de cuotas con escala incorrecta", () => {
  assert.equal(normalizeSuspiciousArsAmount(25_000), 25_000);
  assert.equal(normalizeSuspiciousArsAmount(430_500), 430_500);
  assert.equal(normalizeSuspiciousArsAmount(4_305_000), 430_500);
  assert.equal(normalizeSuspiciousArsAmount(4_055_000), 405_500);
  assert.equal(normalizeSuspiciousArsAmount(2_550_000_000), 2_550_000);
  assert.equal(normalizeSuspiciousArsAmount(-1_217_500_000), -1_217_500);
  assert.equal(normalizeSuspiciousArsAmount(1_234_567), 1_234_567);
});

test("calculateOperationalProjectedBalance usa cuotas normalizadas como importe real", () => {
  const cuotasACobrar = normalizeSuspiciousArsAmount(4_305_000);
  assert.equal(cuotasACobrar, 430_500);
  assert.equal(calculateOperationalProjectedBalance({
    liquidity: 2_779_900,
    cuotasACobrar,
    pendingNetBalance: 150_000,
    saldosAPagar: 250_000,
  }), 3_110_400);
});


test("normalizeSuspiciousMembershipFee corrige cuotas unitarias importadas con un cero extra", () => {
  assert.equal(normalizeSuspiciousMembershipFee(30_000), 30_000);
  assert.equal(normalizeSuspiciousMembershipFee(300_000), 30_000);
  assert.equal(normalizeSuspiciousMembershipFee(25_000_000), 25_000);
});

test("normalizeStatusLabel respeta el estado explícito de la hoja para saldos", () => {
  assert.equal(normalizeStatusLabel("Nuevo Inscripto", "2026-01-01"), "Nuevo Inscripto");
  assert.equal(normalizeStatusLabel("Adeudando", "2026-12-31"), "Adeudando");
});
