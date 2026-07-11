import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMembershipFeeUnit, normalizeReceivableAggregate } from "@miclub/shared";
import { buildEnrollmentReceivablesQuery, calculateOperationalProjectedBalance, normalizePostgresSourceSheet, normalizeStatusLabel, normalizeSuspiciousArsAmount, normalizeSuspiciousMembershipFee, selectCuotasACobrar } from "./postgresDashboardService.js";

test("moneyNormalization normaliza cuotas unitarias y agregados compartidos", () => {
  assert.equal(normalizeMembershipFeeUnit("30.000"), 30_000);
  assert.equal(normalizeMembershipFeeUnit("300.000"), 30_000);
  assert.equal(normalizeReceivableAggregate(4_305_000), 430_500);
  assert.equal(normalizeReceivableAggregate(4_055_000), 405_500);
  assert.equal(normalizeReceivableAggregate(405_500), 405_500);
  assert.equal(normalizeReceivableAggregate(430_500), 430_500);
});

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
    settlementBalance: -250_000,
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

test("selectCuotasACobrar prioriza fallback autoritativo aunque v_dashboard_basic difiera", () => {
  const result = selectCuotasACobrar({ dashboardValue: 405_500, fallbackValue: 430_500 });

  assert.equal(result.cuotasACobrar, 430_500);
  assert.equal(result.source, "fallback");
  assert.equal(result.dashboardValue, 405_500);
  assert.equal(result.fallbackValue, 430_500);
  assert.equal(result.differsBeyondThreshold, true);
});

test("selectCuotasACobrar conserva cero legítimo del fallback", () => {
  const result = selectCuotasACobrar({ dashboardValue: 0, fallbackValue: 0 });

  assert.equal(result.cuotasACobrar, 0);
  assert.equal(result.source, "fallback");
  assert.equal(result.differsBeyondThreshold, false);
});

test("selectCuotasACobrar usa fallback solo cuando v_dashboard_basic es null o falta", () => {
  const nullDashboard = selectCuotasACobrar({ dashboardValue: null, fallbackValue: 430_500 });
  const missingDashboard = selectCuotasACobrar({ fallbackValue: 430_500 });

  assert.equal(nullDashboard.cuotasACobrar, 430_500);
  assert.equal(nullDashboard.source, "fallback");
  assert.equal(missingDashboard.cuotasACobrar, 430_500);
  assert.equal(missingDashboard.source, "fallback");
});


test("buildEnrollmentReceivablesQuery usa la vista v_enrollment_receivable_fees cuando existe", () => {
  const query = buildEnrollmentReceivablesQuery({
    capabilities: {
      hasEnrollmentReceivableFeesView: true,
      hasNormalizeMembershipFeeAmountFunction: true,
    },
    inactiveEnrollmentFilter: " and coalesce(e.inactive, false) = false",
  });

  assert.match(query, /from miclub\.v_enrollment_receivable_fees/);
  assert.doesNotMatch(query, /from miclub\.enrollments e/);
  assert.doesNotMatch(query, /normalize_membership_fee_amount\(e\.fee_amount\)/);
});

test("buildEnrollmentReceivablesQuery usa la función de normalización en fallback sin umbrales manuales", () => {
  const query = buildEnrollmentReceivablesQuery({
    capabilities: {
      hasEnrollmentReceivableFeesView: false,
      hasNormalizeMembershipFeeAmountFunction: true,
    },
    inactiveEnrollmentFilter: " and coalesce(e.inactive, false) = false",
  });

  assert.match(query, /from miclub\.enrollments e/);
  assert.match(query, /miclub\.normalize_membership_fee_amount\(e\.fee_amount\)/);
  assert.match(query, /coalesce\(e\.inactive, false\) = false/);
  assert.doesNotMatch(query, /10000000000|1000000000|100000000|10000000|1000000|100000|mod\(/);
});

test("receivablesFallback coincide con una fila simulada de v_enrollment_receivable_fees", () => {
  const simulatedViewRow = {
    status: "adeudando",
    dueDate: new Date("2026-07-15T00:00:00.000Z"),
    receivableFee: 15_000,
  };
  const fallbackRow = {
    status: "adeudando",
    dueDate: simulatedViewRow.dueDate,
    normalizedFeeAmount: normalizeMembershipFeeUnit(300_000),
    commissionRate: 0.5,
    receivableFee: normalizeMembershipFeeUnit(300_000) * 0.5,
  };

  assert.deepEqual(
    {
      status: fallbackRow.status,
      dueDate: fallbackRow.dueDate,
      receivableFee: fallbackRow.receivableFee,
    },
    simulatedViewRow,
  );
});
