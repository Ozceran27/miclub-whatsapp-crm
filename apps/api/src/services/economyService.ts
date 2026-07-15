import {
  getAnnualEvolution,
  getAnnualSummary as getAnnualSummaryRows,
  getBaseInsights,
  getEconomyDataQuality,
  getLiquiditySnapshotAtOrBefore,
  getOldestLiquiditySnapshot,
  getMonthlySummary,
  getPaymentMethods as getPaymentMethodRows,
  getPendingMovements as getPendingMovementRows,
  getPendingSummary as getPendingSummaryRows,
  getRankingByCategory,
  getRankingBySector,
  getRecentMovements as getRecentMovementRows,
  getRollingMovementSummary,
  type EconomyRow,
} from "../repositories/economyRepository.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";
import { calculateVariation, getCurrentMonthWindow, getRolling30DayWindows, OPERATING_CATEGORIES } from "./economyDomain.js";
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

const legacyVariation = (current: number, previous: number): number | null => calculateVariation(current, previous).percentageChange;

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
  const items = addVariation(normalizeRows(await getAnnualEvolution(parseYear(yearQuery))));
  return { items, total: items.length };
};

export const getBySector = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { start: from, end: to } = getCurrentMonthWindow();
  const items = normalizeRows(await getRankingBySector(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
};

export const getByCategory = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { start: from, end: to } = getCurrentMonthWindow();
  const items = normalizeRows(await getRankingByCategory(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
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
  const windows = getRolling30DayWindows();
  const [rows, finance, previousLiquidityRows, oldestLiquidityRows] = await Promise.all([
    normalizeRows(await getRollingMovementSummary(windows.previousStart, windows.currentStart, windows.currentEnd, OPERATING_CATEGORIES)),
    getPostgresClubFinanceSummary(),
    getLiquiditySnapshotAtOrBefore(windows.currentStart),
    getOldestLiquiditySnapshot(),
  ]);
  const previous = rows.find((row) => row.periodKey === "previous") ?? {};
  const current = rows.find((row) => row.periodKey === "current") ?? {};
  const metric = (key: string, label: string, field: string, inverseImpact = false): JsonRecord => ({ key, label, ...calculateVariation(toNumber(current[field]), toNumber(previous[field]), inverseImpact), applies: true });
  const liquiditySnapshot = previousLiquidityRows[0];
  const oldestLiquiditySnapshot = oldestLiquidityRows[0];
  const liquidityVariation = liquiditySnapshot
    ? {
        key: "liquidity",
        label: "Variación de Liquidez",
        ...calculateVariation(finance.liquidity, toNumber(liquiditySnapshot.liquidity)),
        applies: true,
        available: true,
        currentDate: windows.current.dateTo,
        previousDate: liquiditySnapshot.cutoff_date ?? windows.current.dateFrom,
        targetDate: windows.current.dateFrom,
        snapshotDate: liquiditySnapshot.cutoff_date ?? null,
      }
    : {
        key: "liquidity",
        label: "Variación de Liquidez",
        current: finance.liquidity,
        currentValue: finance.liquidity,
        previous: 0,
        absoluteChange: 0,
        percentageChange: null,
        direction: "stable",
        comparable: false,
        applies: true,
        available: false,
        reason: "INSUFFICIENT_HISTORY",
        targetDate: windows.current.dateFrom,
        oldestAvailableDate: oldestLiquiditySnapshot?.cutoff_date ?? null,
        currentDate: windows.current.dateTo,
        impact: "neutral",
      };
  const items = [
    metric("income", "Variación de Ingresos", "income"),
    metric("expenses", "Variación de Egresos", "expenses", true),
    metric("utility", "Variación de Utilidad", "utility"),
    liquidityVariation,
    metric("operatingProfitability", "Rentabilidad Operativa", "operatingProfitability"),
  ];
  return { currentPeriod: `${windows.current.labelFrom} al ${windows.current.labelTo}`, previousPeriod: `${windows.previous.labelFrom} al ${windows.previous.labelTo}`, rolling30Days: { previousStart: windows.previousStart.toISOString(), currentStart: windows.currentStart.toISOString(), currentEnd: windows.currentEnd.toISOString(), current: { from: windows.current.dateFrom, to: windows.current.dateTo }, previous: { from: windows.previous.dateFrom, to: windows.previous.dateTo }, timezone: windows.timezone }, items, total: items.length };
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
  const liquidity = metric("liquidity");
  const operating = metric("operatingProfitability");
  const quality = qualityRows[0] ?? {};
  const items: JsonRecord[] = [
    { key: "monthly_balance", type: toNumber(summary.balance) >= 0 ? "positive" : "warning", title: "Balance mensual", message: `Balance mensual ${toNumber(summary.balance) >= 0 ? "positivo" : "negativo"}`, metric: "month.balance", period: typeof summary.month === "object" && summary.month !== null && "label" in summary.month ? String(summary.month.label) : "Mes actual", value: toNumber(summary.balance) },
    { key: "income_rolling", type: income?.impact === "favorable" ? "positive" : income?.direction === "stable" ? "info" : "warning", title: "Ingresos móviles", message: income?.comparable === false ? "Ingresos sin base comparable en la ventana anterior" : `Ingresos ${income?.direction === "up" ? "en crecimiento" : income?.direction === "down" ? "en caída" : "estables"} en últimos 30 días`, metric: "rolling.income", period: "Últimos 30 días", value: income?.percentageChange ?? null },
    { key: "expense_rolling", type: expenses?.impact === "favorable" ? "positive" : expenses?.direction === "stable" ? "info" : "warning", title: "Egresos móviles", message: expenses?.comparable === false ? "Egresos sin base comparable en la ventana anterior" : `Egresos ${expenses?.direction === "up" ? "crecieron" : expenses?.direction === "down" ? "bajaron" : "estables"} contra los 30 días anteriores`, metric: "rolling.expenses", period: "Últimos 30 días", value: expenses?.percentageChange ?? null },
    { key: "utility_rolling", type: utility?.impact === "favorable" ? "positive" : utility?.direction === "stable" ? "info" : "warning", title: "Utilidad móvil", message: `Utilidad ${utility?.direction === "up" ? "mejoró" : utility?.direction === "down" ? "retrocedió" : "se mantuvo"} contra la ventana anterior`, metric: "rolling.utility", period: "Últimos 30 días", value: utility?.percentageChange ?? null },
    { key: "liquidity_trend", type: liquidity?.available === false ? "info" : liquidity?.impact === "favorable" ? "positive" : "warning", title: "Liquidez", message: liquidity?.available === false ? "Sin historial suficiente de snapshots para comparar liquidez" : `Liquidez ${liquidity?.direction === "up" ? "en alza" : liquidity?.direction === "down" ? "en baja" : "estable"}`, metric: "liquidity", period: "Últimos 30 días", value: liquidity?.percentageChange ?? null },
    { key: "operating_profitability", type: toNumber(operating?.current) < 0 ? "warning" : operating?.impact === "favorable" ? "positive" : "info", title: "Rentabilidad operativa", message: toNumber(operating?.current) < 0 ? "Rentabilidad operativa negativa en los últimos 30 días" : `Rentabilidad operativa ${operating?.direction === "up" ? "en crecimiento" : operating?.direction === "down" ? "deteriorándose" : "estable"}`, metric: "rolling.operatingProfitability", period: "Últimos 30 días", value: operating?.percentageChange ?? null },
    { key: "pending_movements", type: pendingCount > 0 ? "warning" : "positive", title: "Pendientes", message: pendingCount > 0 ? `${pendingCount} movimientos pendientes requieren seguimiento` : "No hay movimientos pendientes", metric: "pending.count", period: "Actual", value: pendingCount },
    { key: "data_quality", type: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) > 0 ? "warning" : "positive", title: "Calidad de datos", message: `Sin sector: ${toNumber(quality.missingSector)} · sin categoría: ${toNumber(quality.missingCategory)} · sin medio: ${toNumber(quality.missingPaymentMethod)}`, metric: "dataQuality", period: "Histórico", value: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) },
  ];
  const unique = Array.from(new Map(items.map((item) => [item.key, item])).values());
  const priority: Record<string, number> = { warning: 0, info: 1, positive: 2 };
  unique.sort((a, b) => (priority[String(a.type)] ?? 3) - (priority[String(b.type)] ?? 3));
  return { items: unique.slice(0, 8), total: unique.length };
};
