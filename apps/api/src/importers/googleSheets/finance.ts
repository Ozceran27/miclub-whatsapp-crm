/**
 * Cálculos financieros derivados de Google Sheets.
 *
 * Runtime legacy: getClubOperationsSummaryFromGoogleSheets y getClubFinanceDebugFromGoogleSheets
 * conservan los cálculos actuales sin cambios.
 * Importación/migración: helpers de comisiones/cuotas documentan fórmulas a validar contra Postgres.
 */
export {
  normalizeActivityName,
  parseCommissionRate,
  parseAulaCommissionMap,
  getReceivableCommissionRate,
  normalizeSuspiciousArsFee,
  calculateReceivableFee,
  getMemberDueDate,
  calculateFutureReceivableFeesUntilMonthEnd,
  calculateReceivableFeesFromDebtors,
  PROJECTED_BALANCE_FORMULA,
  calculateProjectedBalance,
  getClubOperationsSummaryFromGoogleSheets,
  getClubFinanceDebugFromGoogleSheets
} from "./legacy.js";

export type { ClubFinanceDebugInfo } from "./legacy.js";
