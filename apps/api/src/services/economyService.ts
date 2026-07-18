import {
  getAnnualEvolution,
  getAnnualSummary as getAnnualSummaryRows,
  getBaseInsights,
  getEconomyDataQuality,
  getGrowthSummary,
  getMonthlySummary,
  getPaymentMethods as getPaymentMethodRows,
  getPendingMovements as getPendingMovementRows,
  getPendingSummary as getPendingSummaryRows,
  getRankingByCategory,
  getRankingBySector,
  getRecentMovements as getRecentMovementRows,
  getCompletedMonthMovementSummary,
  type EconomyRow,
} from "../repositories/economyRepository.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";
import { calculateVariation, getCurrentMonthWindow, getLastCompleteMonthWindows, OPERATING_CATEGORIES } from "./economyDomain.js";
import { getPostgresClubFinanceSummary } from "./postgresDashboardService.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const normalizeRows = (rows: EconomyRow[]): JsonRecord[] => rows.map((row) => normalizeRow(row));

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toInteger = (value: unknown): number => Math.trunc(toNumber(value));

const parseLimit = (value: unknown, fallback = DEFAULT_LIMIT): number => {
  const parsed = toInteger(Array.isArray(value) ? value[0] : value);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
};

const parseYear = (value: unknown): number => {
  const parsed = toInteger(Array.isArray(value) ? value[0] : value);
  return parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getUTCFullYear();
};

const monthRange = (date = new Date()): { from: Date; to: Date } => {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { from, to };
};


const currentYearToDateRange = (date = new Date()): { from: Date; to: Date } => {
  const from = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { from, to: date };
};

const legacyVariation = (current: number, previous: number): number | null => calculateVariation(current, previous).percentageChange;


export const normalizeRankingItems = (rows: EconomyRow[] | JsonRecord[]): JsonRecord[] => normalizeRows(rows as EconomyRow[]).map((item) => {
  const income = toNumber(item.income);
  const expenses = toNumber(item.expenses);
  const balance = item.balance === undefined || item.balance === null ? income - expenses : toNumber(item.balance);
  return {
    ...item,
    id: item.id ?? null,
    name: String(item.name || "Sin clasificar"),
    income,
    expenses,
    balance,
    movements: toInteger(item.movements),
  };
}).sort((a, b) => toNumber(b.balance) - toNumber(a.balance) || toNumber(b.income) - toNumber(a.income));

const addVariation = (items: JsonRecord[]): JsonRecord[] =>
  items.map((item, index) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    const income = toNumber(item.income);
    const expenses = toNumber(item.expenses);
    const balance = toNumber(item.balance);
    return {
      ...item,
      incomeVariation: previous ? legacyVariation(income, toNumber(previous.income)) : null,
      expensesVariation: previous ? legacyVariation(expenses, toNumber(previous.expenses)) : null,
      balanceVariation: previous ? legacyVariation(balance, toNumber(previous.balance)) : null,
    };
  });

export const getSummary = async (): Promise<JsonRecord> => {
  const month = getCurrentMonthWindow();
  const [summary, finance] = await Promise.all([
    normalizeRows(await getMonthlySummary(month.start, month.end)),
    getPostgresClubFinanceSummary(),
  ]);
  const row = summary[0] ?? {};
  const income = toNumber(row.income);
  const expenses = toNumber(row.expenses);
  return {
    month: { label: month.label, income, expenses, balance: toNumber(row.balance) },
    current: { liquidity: finance.liquidity, projectedBalance: finance.projectedBalance },
    income,
    expenses,
    balance: toNumber(row.balance),
    liquidity: finance.liquidity,
    projectedBalance: finance.projectedBalance,
    pendingBalance: toNumber(row.pendingBalance),
    completedMovements: toInteger(row.completedMovements),
    totalMovements: toInteger(row.totalMovements),
  };
};

export const getMonthlyEvolution = async (yearQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const baseItems = addVariation(normalizeRows(await getAnnualEvolution(parseYear(yearQuery), OPERATING_CATEGORIES)));
  const items = baseItems.map((item) => {
    const economicGrowth = calculateVariation(toNumber(item.growthIncome), toNumber(item.previousGrowthIncome));
    const clientGrowth = calculateVariation(toNumber(item.cumulativeEnrollments), toNumber(item.previousCumulativeEnrollments));
    const comparable = economicGrowth.percentageChange !== null && clientGrowth.percentageChange !== null;
    return {
      ...item,
      utility: toNumber(item.balance),
      operatingProfitability: toNumber(item.operatingProfitability),
      growth: comparable ? ((economicGrowth.percentageChange ?? 0) + (clientGrowth.percentageChange ?? 0)) / 2 : null,
      economicGrowth: economicGrowth.percentageChange,
      clientGrowth: clientGrowth.percentageChange,
      growthComparable: comparable,
    };
  });
  return { items, total: items.length };
};

export const getBySector = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { start: from, end: to } = getCurrentMonthWindow();
  const items = normalizeRankingItems(await getRankingBySector(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
};

export const getByCategory = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { start: from, end: to } = getCurrentMonthWindow();
  const items = normalizeRankingItems(await getRankingByCategory(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
};


export const getSectorRankings = async (limitQuery?: unknown): Promise<JsonRecord> => {
  const limit = parseLimit(limitQuery, 5);
  const month = getCurrentMonthWindow();
  const annual = currentYearToDateRange();
  const [monthlyItems, annualItems] = await Promise.all([
    getRankingBySector(month.start, new Date(), limit),
    getRankingBySector(annual.from, annual.to, limit),
  ]);
  return {
    monthly: { label: month.label, items: normalizeRankingItems(monthlyItems), total: monthlyItems.length },
    annual: { year: annual.from.getUTCFullYear(), items: normalizeRankingItems(annualItems), total: annualItems.length },
  };
};

export const getPaymentMethods = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const { start: from, end: to } = getCurrentMonthWindow();
  const items = normalizeRows(await getPaymentMethodRows(from, to));
  return { items, total: items.length };
};

export const getRecentMovements = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getRecentMovementRows(parseLimit(limitQuery, 20)));
  return { items, total: items.length };
};

export const getPending = async (limitQuery?: unknown): Promise<JsonRecord> => {
  const [summary, items] = await Promise.all([
    getPendingSummaryRows(),
    getPendingMovementRows(parseLimit(limitQuery, 20)),
  ]);
  const [pendingSummary] = normalizeRows(summary);
  const pendingItems = normalizeRows(items);
  return {
    pendingBalance: toNumber(pendingSummary?.pendingBalance),
    pendingIncome: toNumber(pendingSummary?.pendingIncome),
    pendingExpenses: toNumber(pendingSummary?.pendingExpenses),
    pendingMovements: toInteger(pendingSummary?.pendingMovements),
    items: pendingItems,
    total: toInteger(pendingSummary?.pendingMovements) || pendingItems.length,
  };
};

export const getAnnualSummary = async (yearQuery?: unknown): Promise<JsonRecord> => {
  const [summary] = normalizeRows(await getAnnualSummaryRows(parseYear(yearQuery)));
  return {
    year: toInteger(summary?.year) || parseYear(yearQuery),
    income: toNumber(summary?.income),
    expenses: toNumber(summary?.expenses),
    balance: toNumber(summary?.balance),
    movements: toInteger(summary?.movements),
  };
};

export const getComparison = async (): Promise<JsonRecord> => {
  // Todas las tarjetas de cabecera comparten el mismo reloj de negocio que Crecimiento:
  // los dos últimos meses calendario completos, con límites semiabiertos [inicio, fin).
  const months = getLastCompleteMonthWindows();
  const [rows, growthRows] = await Promise.all([
    normalizeRows(await getCompletedMonthMovementSummary(months.previousStart, months.currentStart, months.currentEnd, OPERATING_CATEGORIES)),
    normalizeRows(await getGrowthSummary(months.previousStart, months.currentStart, months.currentEnd)),
  ]);
  const previous = rows.find((row) => row.periodKey === "previous") ?? {};
  const current = rows.find((row) => row.periodKey === "current") ?? {};
  const metric = (key: string, label: string, field: string, inverseImpact = false): JsonRecord => ({ key, label, ...calculateVariation(toNumber(current[field]), toNumber(previous[field]), inverseImpact), applies: true });
  const previousGrowth = growthRows.find((row) => row.periodKey === "previous") ?? {};
  const currentGrowth = growthRows.find((row) => row.periodKey === "current") ?? {};
  const economicGrowth = calculateVariation(toNumber(currentGrowth.income), toNumber(previousGrowth.income));
  const clientGrowth = calculateVariation(toNumber(currentGrowth.enrollments), toNumber(previousGrowth.enrollments));
  const growthComparable = economicGrowth.percentageChange !== null && clientGrowth.percentageChange !== null;
  const growthPercentage = growthComparable
    ? ((economicGrowth.percentageChange ?? 0) + (clientGrowth.percentageChange ?? 0)) / 2
    : null;
  const growth = {
    key: "growth", label: "Crecimiento", current: growthPercentage ?? 0, previous: 0, absoluteChange: growthPercentage ?? 0,
    percentageChange: growthPercentage, direction: growthPercentage === null || growthPercentage === 0 ? "stable" : growthPercentage > 0 ? "up" : "down",
    comparable: growthComparable, available: growthComparable, applies: true,
    impact: growthPercentage === null || growthPercentage === 0 ? "neutral" : growthPercentage > 0 ? "favorable" : "unfavorable",
    currentPeriod: months.currentLabel, previousPeriod: months.previousLabel,
    economicGrowth: economicGrowth.percentageChange, clientGrowth: clientGrowth.percentageChange,
  };
  const items = [
    metric("income", "Variación de Ingresos", "income"),
    metric("expenses", "Variación de Egresos", "expenses", true),
    metric("utility", "Variación de Utilidad", "utility"),
    growth,
    metric("operatingProfitability", "Rentabilidad Operativa", "operatingProfitability"),
  ];
  return {
    currentPeriod: months.currentLabel,
    previousPeriod: months.previousLabel,
    completedMonthComparison: {
      previousStart: months.previousStart.toISOString(),
      currentStart: months.currentStart.toISOString(),
      currentEnd: months.currentEnd.toISOString(),
      timezone: "America/Argentina/Buenos_Aires",
    },
    items,
    total: items.length,
  };
};

export const getInsights = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const [baseRows, comparison, summary, qualityRows] = await Promise.all([
    normalizeRows(await getBaseInsights()),
    getComparison(),
    getSummary(),
    normalizeRows(await getEconomyDataQuality()),
  ]);
  const valueByMetric = new Map(baseRows.map((row) => [String(row.metric), toNumber(row.value)]));
  const pendingCount = valueByMetric.get("pending_count") ?? 0;
  const metric = (key: string) => (comparison.items as JsonRecord[]).find((item) => item.key === key);
  const income = metric("income");
  const expenses = metric("expenses");
  const utility = metric("utility");
  const operating = metric("operatingProfitability");
  const quality = qualityRows[0] ?? {};
  const items: JsonRecord[] = [
    { key: "monthly_balance", type: toNumber(summary.balance) >= 0 ? "positive" : "warning", title: "Balance mensual", message: `Balance mensual ${toNumber(summary.balance) >= 0 ? "positivo" : "negativo"}`, metric: "month.balance", period: typeof summary.month === "object" && summary.month !== null && "label" in summary.month ? String(summary.month.label) : "Mes actual", value: toNumber(summary.balance) },
    { key: "income_rolling", type: income?.impact === "favorable" ? "positive" : income?.direction === "stable" ? "info" : "warning", title: "Ingresos móviles", message: income?.comparable === false ? "Ingresos sin base comparable en la ventana anterior" : `Ingresos ${income?.direction === "up" ? "en crecimiento" : income?.direction === "down" ? "en caída" : "estables"} en últimos 30 días`, metric: "rolling.income", period: "Últimos 30 días", value: income?.percentageChange ?? null },
    { key: "expense_rolling", type: expenses?.impact === "favorable" ? "positive" : expenses?.direction === "stable" ? "info" : "warning", title: "Egresos móviles", message: expenses?.comparable === false ? "Egresos sin base comparable en la ventana anterior" : `Egresos ${expenses?.direction === "up" ? "crecieron" : expenses?.direction === "down" ? "bajaron" : "estables"} contra los 30 días anteriores`, metric: "rolling.expenses", period: "Últimos 30 días", value: expenses?.percentageChange ?? null },
    { key: "utility_rolling", type: utility?.impact === "favorable" ? "positive" : utility?.direction === "stable" ? "info" : "warning", title: "Utilidad móvil", message: `Utilidad ${utility?.direction === "up" ? "mejoró" : utility?.direction === "down" ? "retrocedió" : "se mantuvo"} contra la ventana anterior`, metric: "rolling.utility", period: "Últimos 30 días", value: utility?.percentageChange ?? null },
    { key: "operating_profitability", type: toNumber(operating?.current) < 0 ? "warning" : operating?.impact === "favorable" ? "positive" : "info", title: "Rentabilidad operativa", message: toNumber(operating?.current) < 0 ? "Rentabilidad operativa negativa en los últimos 30 días" : `Rentabilidad operativa ${operating?.direction === "up" ? "en crecimiento" : operating?.direction === "down" ? "deteriorándose" : "estable"}`, metric: "rolling.operatingProfitability", period: "Últimos 30 días", value: operating?.percentageChange ?? null },
    { key: "pending_movements", type: pendingCount > 0 ? "warning" : "positive", title: "Pendientes", message: pendingCount > 0 ? `${pendingCount} movimientos pendientes requieren seguimiento` : "No hay movimientos pendientes", metric: "pending.count", period: "Actual", value: pendingCount },
    { key: "data_quality", type: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) > 0 ? "warning" : "positive", title: "Calidad de datos", message: `Sin sector: ${toNumber(quality.missingSector)} · sin categoría: ${toNumber(quality.missingCategory)} · sin medio: ${toNumber(quality.missingPaymentMethod)}`, metric: "dataQuality", period: "Histórico", value: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) },
  ];
  const unique = Array.from(new Map(items.map((item) => [item.key, item])).values());
  const priority: Record<string, number> = { warning: 0, info: 1, positive: 2 };
  unique.sort((a, b) => (priority[String(a.type)] ?? 3) - (priority[String(b.type)] ?? 3));
  return { items: unique.slice(0, 8), total: unique.length };
};
