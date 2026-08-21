import assert from "node:assert/strict";
import test from "node:test";
import { aggregateActivitySettlementsBySector, calculateActivitySettlements, validateActivityTerms, type ActivityTerm } from "./activitySettlementService.js";

const term = (overrides: Partial<ActivityTerm> = {}): ActivityTerm => ({ id: "t1", activityId: "a1", sectorId: "s1", mode: "VARIABLE", clubSharePercentage: 40, effectiveFrom: "2026-01-01", ...overrides });
const calculate = (terms: ActivityTerm[], income: number, paid: number, extras: Record<string, unknown> = {}) => calculateActivitySettlements({
  period: { from: "2026-08-01", to: "2026-08-31" }, terms,
  incomes: [{ activityId: "a1", occurredAt: "2026-08-10T03:00:00Z", amount: income, status: "COMPLETADO", ...(extras.income as object) }],
  allocations: [{ activityId: "a1", occurredAt: "2026-08-15T12:00:00Z", amount: paid, status: "COMPLETADO", kind: "PAYMENT", ...(extras.allocation as object) }],
})[0];

test("Arte VARIABLE: 100.000 / club 40 / responsable 60 / pagado 20.000 = 40.000", () => assert.equal(calculate([term()], 100_000, 20_000).responsibleBalance, 40_000));
test("Karate FIXED: 500.000 - fijo 150.000 - pagado 30.000 = 320.000", () => assert.equal(calculate([term({ mode: "FIXED", clubSharePercentage: null, monthlyFixedFee: 150_000 })], 500_000, 30_000).responsibleBalance, 320_000));
test("excluye pendientes, cancelados y anulados", () => {
  assert.equal(calculate([term()], 100_000, 20_000, { income: { status: "PENDIENTE" } }).responsibleBalance, -20_000);
  assert.equal(calculate([term()], 100_000, 20_000, { allocation: { status: "CANCELADO" } }).responsibleBalance, 60_000);
  assert.equal(calculate([term()], 100_000, 20_000, { income: { voidedAt: "2026-08-20" }, allocation: { voidedAt: "2026-08-20" } }).responsibleBalance, 0);
});
test("soporta cero, sobrepago, vigencias y agregación dinámica por sector", () => {
  assert.equal(calculate([term()], 0, 0).responsibleBalance, 0);
  assert.equal(calculate([term()], 100_000, 80_000).responsibleBalance, -20_000);
  const current = calculate([term({ id: "old", effectiveTo: "2026-07-31", clubSharePercentage: 90 }), term({ id: "new", effectiveFrom: "2026-08-01" })], 100_000, 0);
  assert.equal(current.termId, "new");
  assert.deepEqual(aggregateActivitySettlementsBySector([current, { ...current, activityId: "a2" }]), [{ sectorId: "s1", responsibleBalance: 120_000 }]);
});
test("aplica el día calendario de Buenos Aires", () => {
  const row = calculateActivitySettlements({ period: { from: "2026-07-31", to: "2026-07-31" }, terms: [term({ effectiveFrom: "2026-07-01" })], incomes: [{ activityId: "a1", occurredAt: "2026-08-01T01:30:00Z", amount: 100, status: "COMPLETED" }], allocations: [] })[0];
  assert.equal(row.completedIncome, 100);
});

test("asigna ingresos al término local y suma subtotales cuando cambia el porcentaje", () => {
  const rows = calculateActivitySettlements({
    period: { from: "2026-08-01", to: "2026-08-31" },
    terms: [
      term({ id: "club-60", clubSharePercentage: 60, effectiveTo: "2026-08-15" }),
      term({ id: "club-40", clubSharePercentage: 40, effectiveFrom: "2026-08-16" }),
    ],
    incomes: [
      { activityId: "a1", occurredAt: "2026-08-15T12:00:00Z", amount: 100_000, status: "COMPLETADO" },
      { activityId: "a1", occurredAt: "2026-08-16T02:00:00Z", amount: 100_000, status: "COMPLETADO" }, // todavía 15/8 en Buenos Aires
      { activityId: "a1", occurredAt: "2026-08-16T03:00:00Z", amount: 100_000, status: "COMPLETADO" },
    ],
    allocations: [],
  });
  assert.deepEqual(rows.map(({ termId, completedIncome, responsibleGross }) => ({ termId, completedIncome, responsibleGross })), [
    { termId: "club-60", completedIncome: 200_000, responsibleGross: 80_000 },
    { termId: "club-40", completedIncome: 100_000, responsibleGross: 60_000 },
  ]);
  assert.deepEqual(aggregateActivitySettlementsBySector(rows), [{ sectorId: "s1", responsibleBalance: 140_000 }]);
});

test("FIXED multiplica la cuota únicamente para meses calendario completos", () => {
  const fixed = term({ mode: "FIXED", clubSharePercentage: null, monthlyFixedFee: 150_000 });
  const rows = calculateActivitySettlements({
    period: { from: "2026-07-01", to: "2026-08-31" }, terms: [fixed],
    incomes: [{ activityId: "a1", occurredAt: "2026-08-10", amount: 650_000, status: "COMPLETADO" }], allocations: [],
  });
  assert.equal(rows[0].responsibleBalance, 350_000);
  assert.throws(() => calculateActivitySettlements({ period: { from: "2026-07-15", to: "2026-08-31" }, terms: [fixed], incomes: [], allocations: [] }), /complete calendar months/);
});

test("rechaza gaps y superposiciones antes de liquidar", () => {
  assert.throws(() => validateActivityTerms([term({ effectiveTo: "2026-08-10" }), term({ id: "t2", effectiveFrom: "2026-08-12" })]), /Gap/);
  assert.throws(() => validateActivityTerms([term({ effectiveTo: "2026-08-10" }), term({ id: "t2", effectiveFrom: "2026-08-10" })]), /Overlapping/);
});

test("cancelados no generan ingresos ni pagos implícitos", () => {
  const row = calculateActivitySettlements({
    period: { from: "2026-08-01", to: "2026-08-31" }, terms: [term()],
    incomes: [{ activityId: "a1", occurredAt: "2026-08-10", amount: 100_000, status: "CANCELADO" }],
    allocations: [{ activityId: "a1", occurredAt: "2026-08-10", amount: 20_000, status: "CANCELADO", kind: "PAYMENT" }],
  })[0];
  assert.equal(row.responsibleBalance, 0);
});

test("sectores homónimos de dos clubes conservan identidades independientes", () => {
  const base = calculate([term()], 100_000, 20_000);
  assert.deepEqual(aggregateActivitySettlementsBySector([
    { ...base, sectorId: "club-a/arte" },
    { ...base, activityId: "a2", sectorId: "club-b/arte" },
  ]), [
    { sectorId: "club-a/arte", responsibleBalance: 40_000 },
    { sectorId: "club-b/arte", responsibleBalance: 40_000 },
  ]);
});
