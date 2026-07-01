import {
  getAnnualEvolution,
  getAnnualSummary as getAnnualSummaryRows,
  getBaseInsights,
  getMonthlySummary,
  getPaymentMethods as getPaymentMethodRows,
  getPendingMovements as getPendingMovementRows,
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

const addVariation = (items: JsonRecord[]): JsonRecord[] =>
  items.map((item, index) => {
    const previousBalance = index > 0 ? toNumber(items[index - 1]?.balance) : 0;
    const balance = toNumber(item.balance);
    const balanceVariation = previousBalance === 0 ? null : ((balance - previousBalance) / Math.abs(previousBalance)) * 100;
    return { ...item, balanceVariation };
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

export const getPending = async (limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getPendingMovementRows(parseLimit(limitQuery, 20)));
  return { items, total: items.length };
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

export const getInsights = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const rows = normalizeRows(await getBaseInsights());
  const valueByMetric = new Map(rows.map((row) => [String(row.metric), toNumber(row.value)]));
  const current = valueByMetric.get("current_month_balance") ?? 0;
  const previous = valueByMetric.get("previous_month_balance") ?? 0;
  const pendingCount = valueByMetric.get("pending_count") ?? 0;
  const variation = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
  const items: JsonRecord[] = [
    { key: "monthly_balance", type: current >= 0 ? "positive" : "warning", message: `Balance mensual ${current >= 0 ? "positivo" : "negativo"}`, value: current },
    { key: "monthly_variation", type: variation === null || variation >= 0 ? "info" : "warning", message: variation === null ? "Sin base del mes anterior para comparar" : `Variación mensual ${variation.toFixed(2)}%`, value: variation },
    { key: "pending_movements", type: pendingCount > 0 ? "warning" : "positive", message: pendingCount > 0 ? `${pendingCount} movimientos pendientes` : "No hay movimientos pendientes", value: pendingCount },
  ];
  return { items, total: items.length };
};
