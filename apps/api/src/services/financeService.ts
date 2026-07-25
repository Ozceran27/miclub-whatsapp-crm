import { getMovements } from "../repositories/movementsRepository.js";
import { getPayments } from "../repositories/paymentsRepository.js";
import { getReceivables } from "../repositories/receivablesRepository.js";
import { getSectorFinanceSummary } from "../repositories/dashboardRepository.js";
import type { RequestAuthContext } from "../auth/types.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

const normalizeRows = (rows: JsonRecord[]): JsonRecord[] => rows.map(normalizeRow);

export const listMovements = async (auth: RequestAuthContext): Promise<JsonRecord[]> => normalizeRows(await getMovements(auth.clubId));
export const listReceivables = async (auth: RequestAuthContext): Promise<JsonRecord[]> => normalizeRows(await getReceivables(auth.clubId));
export const listPayments = async (auth: RequestAuthContext): Promise<JsonRecord[]> => normalizeRows(await getPayments(auth.clubId));

export const getOperationalBalances = async (auth: RequestAuthContext): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary(auth.clubId));
  return { items, total: items.length };
};

export const getSectorSettlements = async (auth: RequestAuthContext): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary(auth.clubId));
  return { items, total: items.length };
};
