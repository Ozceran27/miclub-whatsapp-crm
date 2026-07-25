import { getDashboardBasic as getDashboardBasicRows, getSectorFinanceSummary as getSectorFinanceSummaryRows } from "../repositories/dashboardRepository.js";
import type { RequestAuthContext } from "../auth/types.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

const normalizeRows = (rows: JsonRecord[]): JsonRecord[] => rows.map(normalizeRow);

export const getDashboardBasic = async (auth: RequestAuthContext): Promise<{ item: JsonRecord | null; items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getDashboardBasicRows(auth.clubId));
  return { item: items[0] ?? null, items, total: items.length };
};

export const getSectorFinanceSummary = async (auth: RequestAuthContext): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummaryRows(auth.clubId));
  return { items, total: items.length };
};
