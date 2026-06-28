import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardReconciliation } from "./dashboardReconciliationService.js";
import type { ClubOperationsSummary, SectorOperationalSummary } from "@miclub/shared";

// Fixture derivada de apps/api/data/db/Dashboard CLUB Actualizado.xlsx.
const financeSummary = (overrides: Partial<ClubOperationsSummary> = {}): ClubOperationsSummary => ({
  liquidity: 1081000,
  cash: 416000,
  bank: 665000,
  dollars: 1200,
  pendingIncome: 0,
  pendingExpenses: 0,
  pendingNetBalance: 250000,
  cuotasAdeudadas: 0,
  cuotasACobrar: 450000,
  futureReceivableFeesUntilMonthEnd: 0,
  saldosAPagar: 125000,
  projectedBalance: 1656000,
  sectorBalances: [],
  incomeBySector: [{ name: "FITNESS", amount: 900000 }, { name: "LOCAL 1", amount: 110000 }, { name: "CANTINA", amount: 0 }],
  expenseBySector: [{ name: "FITNESS", amount: 350000 }, { name: "LOCAL 1", amount: 0 }, { name: "CANTINA", amount: 80000 }],
  incomeByCategory: [],
  expenseByCategory: [],
  totalIncomeSectors: 2,
  remainingIncomeSectors: 0,
  totalExpenseSectors: 2,
  remainingExpenseSectors: 0,
  totalIncomeCategories: 0,
  remainingIncomeCategories: 0,
  totalExpenseCategories: 0,
  remainingExpenseCategories: 0,
  ...overrides,
});

const sectorSummary = (overrides: Partial<SectorOperationalSummary> = {}): SectorOperationalSummary => ({
  fitness: {
    totalMembers: 0,
    activeMembers: 0,
    totalProfitability: 225000,
    currentMonthProfitability: 0,
    totalDebtors: 0,
    totalDebtAmount: 0,
    settlementBalance: 62500,
  },
  salon: {
    totalMembers: 0,
    activeMembers: 0,
    totalProfitability: 0,
    currentMonthProfitability: 0,
    mostPopularActivity: null,
    leastPopularActivity: null,
  },
  aula: {
    totalMembers: 0,
    activeMembers: 0,
    totalProfitability: 0,
    currentMonthProfitability: 0,
    averageCommission: null,
    mostPopularActivity: null,
  },
  local1: {
    totalRelevantIncomeMovements: 0,
    last30DaysRelevantIncomeMovements: 0,
    totalProfitability: 77000,
    currentMonthProfitability: 0,
    settlementBalance: 18000,
    highlightedIncome: null,
  },
  cantina: {
    kioskIncome: 40000,
    drinksIncome: 25000,
    cmv: 15000,
    totalProfitability: 50000,
  },
  crm: {
    totalMembers: 0,
    activeMembers: 0,
    totalDebtors: 0,
    totalDebtAmount: 0,
  },
  ...overrides,
});

const fixtureInput = () => ({
  googleFinanceDebug: {
    liquidity: 1081000,
    parsedCash: 416000,
    parsedBank: 665000,
    parsedDollars: 1200,
    cuotasACobrar: 450000,
    saldosAPagar: 125000,
    projectedBalance: 1656000,
  },
  googleFinanceSummary: financeSummary(),
  googleSectorDebug: {
    parsedBalances: {
      fitness: 225000,
      fitnessSettlement: 62500,
      salon: 0,
      aula: 0,
      local1: 77000,
      local1Settlement: 18000,
    },
    cantina: {
      kioskIncome: 40000,
      drinksIncome: 25000,
      cmv: 15000,
      totalProfitability: 50000,
      cmvSource: "EGRESOS / BEBIDAS / CANTINA",
      totalProfitabilityFormula: "KIOSCO + BEBIDAS - CMV",
    },
  },
  googleSectorSummary: sectorSummary(),
  postgresFinanceSummary: financeSummary(),
  postgresSectorSummary: sectorSummary(),
});

test("buildDashboardReconciliation genera pares mínimos sin diferencias para el fixture del dashboard", () => {
  const result = buildDashboardReconciliation(fixtureInput());

  assert.equal(result.summary.difference, 0);
  assert.equal(result.summary.missing_google_sheets, 0);
  assert.equal(result.summary.missing_postgres, 0);
  assert.ok(result.metrics.length >= 19);
  assert.deepEqual(
    result.metrics.find((metric) => metric.metricKey === "club.liquidity"),
    { metricKey: "club.liquidity", googleSheetsValue: 1081000, postgresValue: 1081000, delta: 0, status: "match" },
  );
  assert.ok(result.metrics.some((metric) => metric.metricKey === "cantina.cmv"));
  assert.ok(result.metrics.some((metric) => metric.metricKey === "sector.fitness.income"));
  assert.ok(result.metrics.some((metric) => metric.metricKey === "sector.cantina.expense"));
});

test("buildDashboardReconciliation marca diferencias y faltantes", () => {
  const input = fixtureInput();
  input.postgresFinanceSummary = financeSummary({ liquidity: 1081500, expenseBySector: [] });
  input.postgresSectorSummary = sectorSummary({ fitness: { ...sectorSummary().fitness, settlementBalance: null } });

  const result = buildDashboardReconciliation(input);

  assert.equal(result.metrics.find((metric) => metric.metricKey === "club.liquidity")?.status, "difference");
  assert.equal(result.metrics.find((metric) => metric.metricKey === "club.liquidity")?.delta, 500);
  assert.equal(result.metrics.find((metric) => metric.metricKey === "fitness.settlement_balance")?.status, "missing_postgres");
  assert.equal(result.metrics.find((metric) => metric.metricKey === "sector.cantina.expense")?.status, "missing_postgres");
});
