import {
  getAnnualEvolution,
  getAnnualSummary as getAnnualSummaryRows,
  getBaseInsights,
  getCurrentPreviousMonthComparison,
  getMonthlySummary,
  getPaymentMethods as getPaymentMethodRows,
  getPendingMovements as getPendingMovementRows,
  getPendingSummary as getPendingSummaryRows,
  getRankingByCategory,
  getRankingBySector,
  getRecentMovements as getRecentMovementRows,
  type EconomyRow,
} from "../repositories/economyRepository.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

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

const calculateVariation = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

const getDirection = (current: number, previous: number): "up" | "down" | "flat" | "none" => {
  if (previous === 0 && current === 0) return "none";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
};

const addVariation = (items: JsonRecord[]): JsonRecord[] =>
  items.map((item, index) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    const income = toNumber(item.income);
    const expenses = toNumber(item.expenses);
    const balance = toNumber(item.balance);
    return {
      ...item,
      incomeVariation: previous ? calculateVariation(income, toNumber(previous.income)) : null,
      expensesVariation: previous ? calculateVariation(expenses, toNumber(previous.expenses)) : null,
      balanceVariation: previous ? calculateVariation(balance, toNumber(previous.balance)) : null,
    };
  });

export const getSummary = async (): Promise<JsonRecord> => {
  const [summary] = normalizeRows(await getMonthlySummary());
  return {
    income: toNumber(summary?.income),
    expenses: toNumber(summary?.expenses),
    balance: toNumber(summary?.balance),
    pendingBalance: toNumber(summary?.pendingBalance),
    completedMovements: toInteger(summary?.completedMovements),
    totalMovements: toInteger(summary?.totalMovements),
  };
};

export const getMonthlyEvolution = async (yearQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = addVariation(normalizeRows(await getAnnualEvolution(parseYear(yearQuery))));
  return { items, total: items.length };
};

export const getBySector = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { from, to } = monthRange();
  const items = normalizeRows(await getRankingBySector(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
};

export const getByCategory = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const { from, to } = monthRange();
  const items = normalizeRows(await getRankingByCategory(from, to, parseLimit(limitQuery)));
  return { items, total: items.length };
};

export const getPaymentMethods = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const { from, to } = monthRange();
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
  const rows = normalizeRows(await getCurrentPreviousMonthComparison());
  const previous = rows.find((row) => row.periodKey === "previous") ?? {};
  const current = rows.find((row) => row.periodKey === "current") ?? {};
  const buildMetric = (key: string, label: string, applies = true): JsonRecord => {
    const currentValue = toNumber(current[key]);
    const previousValue = toNumber(previous[key]);
    return {
      key,
      label,
      current: currentValue,
      previous: previousValue,
      variation: applies ? calculateVariation(currentValue, previousValue) : null,
      direction: applies ? getDirection(currentValue, previousValue) : "none",
      applies,
    };
  };
  const liquidityApplies = current.liquidity !== null && current.liquidity !== undefined && previous.liquidity !== null && previous.liquidity !== undefined;
  const items = [
    buildMetric("income", "Variación de ingresos"),
    buildMetric("expenses", "Variación de egresos"),
    buildMetric("balance", "Variación de utilidad"),
    buildMetric("liquidity", "Variación de liquidez", liquidityApplies),
  ];
  return {
    currentPeriod: String(current.period ?? ""),
    previousPeriod: String(previous.period ?? ""),
    items,
    total: items.length,
  };
};

export const getInsights = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const [rows, comparison] = await Promise.all([normalizeRows(await getBaseInsights()), getComparison()]);
  const valueByMetric = new Map(rows.map((row) => [String(row.metric), toNumber(row.value)]));
  const current = valueByMetric.get("current_month_balance") ?? 0;
  const pendingCount = valueByMetric.get("pending_count") ?? 0;
  const metric = (key: string) => (comparison.items as JsonRecord[]).find((item) => item.key === key);
  const income = metric("income");
  const expenses = metric("expenses");
  const balance = metric("balance");
  const liquidity = metric("liquidity");
  const items: JsonRecord[] = [
    { key: "monthly_balance", type: current >= 0 ? "positive" : "warning", message: `Utilidad mensual ${current >= 0 ? "positiva" : "negativa"}: ${current.toLocaleString("es-AR")}`, value: current },
    { key: "income_trend", type: toNumber(income?.current) >= toNumber(income?.previous) ? "positive" : "warning", message: `Ingresos ${income?.direction === "up" ? "en alza" : income?.direction === "down" ? "en baja" : "estables"} contra el mes anterior`, value: toNumber(income?.variation) },
    { key: "expense_trend", type: toNumber(expenses?.current) > toNumber(expenses?.previous) ? "warning" : "positive", message: `Egresos ${expenses?.direction === "up" ? "crecieron" : expenses?.direction === "down" ? "bajaron" : "estables"} contra el mes anterior`, value: toNumber(expenses?.variation) },
    { key: "profit_trend", type: toNumber(balance?.current) >= toNumber(balance?.previous) ? "positive" : "warning", message: `Utilidad ${balance?.direction === "up" ? "mejoró" : balance?.direction === "down" ? "retrocedió" : "se mantuvo"} en la comparación mensual`, value: toNumber(balance?.variation) },
    { key: "liquidity_trend", type: liquidity?.applies === false ? "info" : toNumber(liquidity?.current) >= toNumber(liquidity?.previous) ? "positive" : "warning", message: liquidity?.applies === false ? "Sin saldos de liquidez suficientes para comparar" : `Liquidez ${liquidity?.direction === "up" ? "en alza" : liquidity?.direction === "down" ? "en baja" : "estable"}`, value: liquidity?.applies === false ? null : toNumber(liquidity?.variation) },
    { key: "pending_movements", type: pendingCount > 0 ? "warning" : "positive", message: pendingCount > 0 ? `${pendingCount} movimientos pendientes requieren seguimiento` : "No hay movimientos pendientes", value: pendingCount },
  ];
  return { items, total: items.length };
};
