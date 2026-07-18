import assert from "node:assert/strict";
import test from "node:test";
import { calculateSectorProfitability, calculateVariation, getCurrentMonthWindow, getLastCompleteMonthWindows, getRolling30DayWindows, isCompletedMovementStatus, isOperatingCategory } from "./economyDomain.js";

test("current month window uses Argentina timezone and month label", () => {
  const window = getCurrentMonthWindow(new Date("2026-07-14T12:00:00Z"));
  assert.equal(window.label, "Julio");
  assert.equal(window.start.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-01T03:00:00.000Z");
});

test("rolling windows cover two consecutive 30 day windows without overlap", () => {
  const windows = getRolling30DayWindows(new Date("2026-07-14T12:00:00Z"));
  assert.equal(windows.currentStart.toISOString(), "2026-06-14T12:00:00.000Z");
  assert.equal(windows.currentEnd.toISOString(), "2026-07-14T12:00:00.000Z");
  assert.equal(windows.previousStart.toISOString(), "2026-05-15T12:00:00.000Z");
  assert.equal(windows.current.dateFrom, "2026-06-14");
  assert.equal(windows.current.dateTo, "2026-07-14");
  assert.equal(windows.current.labelFrom, "14/06/2026");
  assert.equal(windows.current.labelTo, "14/07/2026");
  assert.equal((windows.currentEnd.getTime() - windows.currentStart.getTime()) / 86_400_000, 30);
  assert.equal((windows.currentStart.getTime() - windows.previousStart.getTime()) / 86_400_000, 30);
});

test("completed month comparison uses June versus May on 17 July 2026", () => {
  const months = getLastCompleteMonthWindows(new Date("2026-07-17T12:00:00Z"));
  assert.equal(months.currentStart.toISOString(), "2026-06-01T03:00:00.000Z");
  assert.equal(months.previousStart.toISOString(), "2026-05-01T03:00:00.000Z");
  assert.equal(months.currentEnd.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(months.currentLabel, "junio de 2026");
  assert.equal(months.previousLabel, "mayo de 2026");
});

test("growth averages monthly income with accumulated enrollments at each month end", () => {
  const incomeGrowth = calculateVariation(5_600_000, 3_800_000);
  const clientGrowth = calculateVariation(112, 86);

  assert.ok(Math.abs((incomeGrowth.percentageChange ?? 0) - 47.3684211) < 0.0001);
  assert.ok(Math.abs((clientGrowth.percentageChange ?? 0) - 30.2325581) < 0.0001);
  assert.ok(Math.abs(((incomeGrowth.percentageChange ?? 0) + (clientGrowth.percentageChange ?? 0)) / 2 - 38.8004896) < 0.0001);
});

test("monthly comparison variations use the completed-month values", () => {
  const income = calculateVariation(5_600_000, 3_800_000);
  const expenses = calculateVariation(2_100_000, 1_400_000, true);
  const utility = calculateVariation(3_500_000, 2_400_000);
  const operatingProfitability = calculateVariation(2_800_000, 1_600_000);

  assert.ok(Math.abs((income.percentageChange ?? 0) - 47.3684211) < 0.0001);
  assert.equal(expenses.current, 2_100_000);
  assert.equal(expenses.previous, 1_400_000);
  assert.ok(Math.abs((utility.percentageChange ?? 0) - 45.8333333) < 0.0001);
  assert.equal(operatingProfitability.current, 2_800_000);
  assert.equal(operatingProfitability.previous, 1_600_000);
});

test("variation handles zero base and negative crossings without infinity", () => {
  assert.deepEqual(calculateVariation(0, 0), { current: 0, previous: 0, absoluteChange: 0, percentageChange: 0, direction: "stable", comparable: true, impact: "neutral" });
  assert.equal(calculateVariation(100, 0).percentageChange, null);
  assert.equal(calculateVariation(100, 0).comparable, false);
  assert.equal(Number.isFinite(calculateVariation(100, -50).percentageChange ?? 0), true);
  assert.equal(calculateVariation(-50, 100).direction, "down");
});

test("operating categories are normalized exactly", () => {
  assert.equal(isOperatingCategory(" inscripción "), true);
  assert.equal(isOperatingCategory("COMISIÓN"), true);
  assert.equal(isOperatingCategory(" alquiler "), true);
  assert.equal(isOperatingCategory("cuota extra"), false);
  assert.equal(isOperatingCategory("CMV"), false);
  assert.equal(isOperatingCategory("CAPITAL"), false);
});

test("sector ranking normalizes numeric fields and orders by profitability", async () => {
  const { normalizeRankingItems } = await import("./economyService.js");
  const result = normalizeRankingItems([
    { id: "a", name: "Sector A", income: "1000", expenses: "300", balance: "700", movements: "4" },
    { id: "b", name: "Sector B", income: "900", expenses: "100", balance: "800", movements: "2" },
  ]);

  assert.equal(result[0].name, "Sector B");
  assert.equal(result[0].income, 900);
  assert.equal(result[0].expenses, 100);
  assert.equal(result[0].balance, 800);
  assert.equal(result[1].name, "Sector A");
});


test("completed status normalization accepts completed variants only", () => {
  assert.equal(isCompletedMovementStatus(" Completado "), true);
  assert.equal(isCompletedMovementStatus("completed"), true);
  assert.equal(isCompletedMovementStatus("Pendiente"), false);
});

test("sector profitability uses completed operating income minus expenses", () => {
  const result = calculateSectorProfitability([
    { sector: "Fitness", movement_type: "INGRESOS", category: "CUOTA", operational_status: "Completado", amount: 1000 },
    { sector: "Fitness", movement_type: "EGRESOS", category: "BEBIDAS", operational_status: "Completado", amount: 300 },
    { sector: "Fitness", movement_type: "INGRESOS", category: "CUOTA", operational_status: "Pendiente", amount: 5000 },
    { sector: "Fitness", movement_type: "INGRESOS", category: "CAPITAL", operational_status: "Completado", amount: 9000 },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].income, 1000);
  assert.equal(result[0].expenses, 300);
  assert.equal(result[0].balance, 700);
  assert.equal(result[0].movements, 2);
});
