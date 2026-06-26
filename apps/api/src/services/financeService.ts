import { getMovements } from "../repositories/movementsRepository.js";
import { getPayments } from "../repositories/paymentsRepository.js";
import { getReceivables } from "../repositories/receivablesRepository.js";
import { getSectorFinanceSummary } from "../repositories/dashboardRepository.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

const normalizeRows = (rows: JsonRecord[]): JsonRecord[] => rows.map(normalizeRow);

export const listMovements = async (): Promise<JsonRecord[]> => normalizeRows(await getMovements());
export const listReceivables = async (): Promise<JsonRecord[]> => normalizeRows(await getReceivables());
export const listPayments = async (): Promise<JsonRecord[]> => normalizeRows(await getPayments());

export const getOperationalBalances = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary());
  return { items, total: items.length };
};

export const getSectorSettlements = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary());
  return { items, total: items.length };
};
