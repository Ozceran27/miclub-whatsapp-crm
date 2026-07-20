import assert from "node:assert/strict";
import test from "node:test";
import { calculateCategoryBalance, calculateOperatingProfitability, calculateOperatingProfitabilityBySector, calculateSectorProfitability, calculateVariation, DEBT_LIABILITY_CATEGORIES, getCurrentMonthWindow, getLastCompleteMonthWindows, getOperatingCategories, getRolling30DayWindows, isCompletedMovementStatus, isOperatingCategory, NON_OPERATING_EXPENSE_CATEGORIES, normalizeAmount, normalizeCategory } from "./economyDomain.js";

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

test("canonical operating profitability categories keep UI accents and normalize internally", () => {
  assert.deepEqual(getOperatingCategories(), [
    "INSCRIPCIÓN",
    "CUOTA",
    "TURNOS",
    "COMISIÓN",
    "ALQUILER",
    "EVENTOS",
    "VENTAS",
    "CLASES",
    "CURSOS",
    "KIOSCO",
    "BEBIDAS",
  ]);
  assert.equal(normalizeCategory(" comisión "), "COMISION");
  assert.equal(isOperatingCategory("inscripcion"), true);
  assert.equal(isOperatingCategory("DEPÓSITOS"), false);
});

test("operating profitability excludes non-operating categories and pending movements", () => {
  const result = calculateOperatingProfitability([
    { sector: "Fitness", movement_type: "INGRESO", category: "DEPÓSITOS", operational_status: "Completado", amount: 100_000 },
    { sector: "Fitness", movement_type: "INGRESO", category: "CUOTA", operational_status: "Pendiente", amount: 100_000 },
    { sector: "Fitness", movement_type: "INGRESO", category: "CUOTA", operational_status: "Completado", amount: 100_000 },
    { sector: "Cantina", movement_type: "EGRESO", category: "BEBIDAS", operational_status: "Completado", amount: 20_000 },
  ]);

  assert.equal(result.income, 100_000);
  assert.equal(result.expenses, 20_000);
  assert.equal(result.profitability, 80_000);
  assert.equal(result.movementsCount, 2);
});

test("operating profitability by sector applies the same official filters", () => {
  const result = calculateOperatingProfitabilityBySector([
    { sector: "Fitness", movement_type: "INGRESO", category: "CUOTA", operational_status: "Completado", amount: 100_000 },
    { sector: "Fitness", movement_type: "EGRESO", category: "CLASES", operational_status: "Completado", amount: 30_000 },
    { sector: "Fitness", movement_type: "INGRESO", category: "DEPÓSITOS", operational_status: "Completado", amount: 500_000 },
    { sector: "Fitness", movement_type: "INGRESO", category: "CUOTA", operational_status: "Pendiente", amount: 90_000 },
    { sector: "Cantina", movement_type: "INGRESO", category: "BEBIDAS", operational_status: "Completado", amount: 10_000 },
  ], { sector: "fitness" });

  assert.equal(result.sector, "fitness");
  assert.equal(result.income, 100_000);
  assert.equal(result.expenses, 30_000);
  assert.equal(result.profitability, 70_000);
  assert.equal(result.movementsCount, 2);
});

test("operating profitability normalizes signed and formatted amounts without double subtracting", () => {
  assert.equal(normalizeAmount("$ 1.200,50"), 1200.5);
  const result = calculateOperatingProfitability([
    { movement_type: "income", category: "CUOTA", operational_status: "completed", amount: "$ 1.200,50" },
    { movement_type: "expense", category: "BEBIDAS", operational_status: "completed", amount: -200 },
  ]);

  assert.equal(result.income, 1200.5);
  assert.equal(result.expenses, 200);
  assert.equal(result.profitability, 1000.5);
});

test("category balances use completed income minus expenses and normalized names", () => {
  const nonOperating = calculateCategoryBalance([
    { movement_type: "INGRESOS", category: " publicidad ", operational_status: "Completado", amount: 100_000 },
    { movement_type: "EGRESOS", category: "PUBLICIDAD", operational_status: "Completado", amount: 300_000 },
    { movement_type: "EGRESOS", category: "DEUDA", operational_status: "Completado", amount: 150_000 },
    { movement_type: "INGRESOS", category: "VIATICOS", operational_status: "Pendiente", amount: 999_000 },
  ], NON_OPERATING_EXPENSE_CATEGORIES);

  assert.equal(nonOperating.income, 100_000);
  assert.equal(nonOperating.expenses, 300_000);
  assert.equal(nonOperating.balance, -200_000);
  assert.equal(nonOperating.movementsCount, 2);
});

test("debt liability balances include DEUDA and DEUDAS variants only", () => {
  const debt = calculateCategoryBalance([
    { movement_type: "INGRESOS", category: "deuda", operational_status: "Completado", amount: 50_000 },
    { movement_type: "EGRESOS", category: "DEUDAS", operational_status: "Completado", amount: 150_000 },
    { movement_type: "EGRESOS", category: "PUBLICIDAD", operational_status: "Completado", amount: 500_000 },
  ], DEBT_LIABILITY_CATEGORIES);

  assert.equal(debt.income, 50_000);
  assert.equal(debt.expenses, 150_000);
  assert.equal(debt.balance, -100_000);
  assert.equal(debt.movementsCount, 2);
});
