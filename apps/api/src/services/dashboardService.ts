import { getDashboardBasic as getDashboardBasicRows, getSectorFinanceSummary as getSectorFinanceSummaryRows } from "../repositories/dashboardRepository.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

const normalizeRows = (rows: JsonRecord[]): JsonRecord[] => rows.map(normalizeRow);

export const getDashboardBasic = async (): Promise<{ item: JsonRecord | null; items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getDashboardBasicRows());
  return { item: items[0] ?? null, items, total: items.length };
};

export const getSectorFinanceSummary = async (): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummaryRows());
  return { items, total: items.length };
};
