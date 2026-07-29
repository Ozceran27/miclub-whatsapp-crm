import { getMovements } from "../repositories/movementsRepository.js";
import { getPayments } from "../repositories/paymentsRepository.js";
import { getReceivables } from "../repositories/receivablesRepository.js";
import { getSectorFinanceSummary } from "../repositories/dashboardRepository.js";
import type { RequestAuthContext } from "../auth/types.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";
import type { MovementQuery } from "../repositories/movementsRepository.js";
import type { PaymentQuery } from "../repositories/paymentsRepository.js";
import type { ReceivableQuery } from "../repositories/receivablesRepository.js";

const normalizeRows = (rows: JsonRecord[]): JsonRecord[] => rows.map(normalizeRow);

type Page = { items: JsonRecord[]; total: number; limit: number; offset: number };
const page = (result: { rows: JsonRecord[]; total: number }, limit: number, offset: number): Page => ({ items: normalizeRows(result.rows), total: result.total, limit, offset });

export const listMovements = async (auth: RequestAuthContext, query: Omit<MovementQuery, "clubId">): Promise<Page> => page(await getMovements({ ...query, clubId: auth.clubId }), query.limit, query.offset);
export const listReceivables = async (auth: RequestAuthContext, query: Omit<ReceivableQuery, "clubId">): Promise<Page> => page(await getReceivables({ ...query, clubId: auth.clubId }), query.limit, query.offset);
export const listPayments = async (auth: RequestAuthContext, query: Omit<PaymentQuery, "clubId">): Promise<Page> => page(await getPayments({ ...query, clubId: auth.clubId }), query.limit, query.offset);

export const getOperationalBalances = async (auth: RequestAuthContext): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary(auth.clubId));
  return { items, total: items.length };
};

export const getSectorSettlements = async (auth: RequestAuthContext): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getSectorFinanceSummary(auth.clubId));
  return { items, total: items.length };
};
