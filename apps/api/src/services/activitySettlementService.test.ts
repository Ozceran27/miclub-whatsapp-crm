import assert from "node:assert/strict";
import test from "node:test";
import { aggregateActivitySettlementsBySector, calculateActivitySettlements, type ActivityTerm } from "./activitySettlementService.js";

const term = (overrides: Partial<ActivityTerm> = {}): ActivityTerm => ({ id: "t1", activityId: "a1", sectorId: "s1", mode: "VARIABLE", responsibleSharePercentage: 60, effectiveFrom: "2026-01-01", ...overrides });
const calculate = (terms: ActivityTerm[], income: number, paid: number, extras: Record<string, unknown> = {}) => calculateActivitySettlements({
  period: { from: "2026-08-01", to: "2026-08-31" }, terms,
  incomes: [{ activityId: "a1", occurredAt: "2026-08-10T03:00:00Z", amount: income, status: "COMPLETADO", ...(extras.income as object) }],
  allocations: [{ activityId: "a1", occurredAt: "2026-08-15T12:00:00Z", amount: paid, status: "COMPLETADO", kind: "PAYMENT", ...(extras.allocation as object) }],
})[0];

test("VARIABLE: 100.000 / club 40 / responsable 60 / pagado 20.000 = 40.000", () => assert.equal(calculate([term()], 100_000, 20_000).responsibleBalance, 40_000));
test("FIXED: 500.000 - fijo 150.000 - pagado 30.000 = 320.000", () => assert.equal(calculate([term({ mode: "FIXED", responsibleSharePercentage: null, monthlyFixedFee: 150_000 })], 500_000, 30_000).responsibleBalance, 320_000));
test("excluye pendientes, cancelados y anulados", () => {
  assert.equal(calculate([term()], 100_000, 20_000, { income: { status: "PENDIENTE" } }).responsibleBalance, -20_000);
  assert.equal(calculate([term()], 100_000, 20_000, { allocation: { status: "CANCELADO" } }).responsibleBalance, 60_000);
  assert.equal(calculate([term()], 100_000, 20_000, { income: { voidedAt: "2026-08-20" }, allocation: { voidedAt: "2026-08-20" } }).responsibleBalance, 0);
});
test("soporta cero, sobrepago, vigencias y agregación dinámica por sector", () => {
  assert.equal(calculate([term()], 0, 0).responsibleBalance, 0);
  assert.equal(calculate([term()], 100_000, 80_000).responsibleBalance, -20_000);
  const current = calculate([term({ id: "old", effectiveTo: "2026-07-31", responsibleSharePercentage: 10 }), term({ id: "new", effectiveFrom: "2026-08-01" })], 100_000, 0);
  assert.equal(current.termId, "new");
  assert.deepEqual(aggregateActivitySettlementsBySector([current, { ...current, activityId: "a2" }]), [{ sectorId: "s1", responsibleBalance: 120_000 }]);
});
test("aplica el día calendario de Buenos Aires", () => {
  const row = calculateActivitySettlements({ period: { from: "2026-07-31", to: "2026-07-31" }, terms: [term({ effectiveFrom: "2026-07-01" })], incomes: [{ activityId: "a1", occurredAt: "2026-08-01T01:30:00Z", amount: 100, status: "COMPLETED" }], allocations: [] })[0];
  assert.equal(row.completedIncome, 100);
});
