/**
 * Lectura y enriquecimiento de socios desde Google Sheets.
 *
 * Runtime legacy: getMembersFromGoogleSheets y getPaymentsDebugFromGoogleSheets son usados
 * por endpoints/servicios actuales.
 * Importación/migración: resolución de columnas, normalizadores re-exportados y pagos por DNI
 * soportan dry-runs y scripts de migración.
 */
export {
  formatDateOnlyForPostgres,
  formatArgentinaTimestampForPostgres,
  normalizeDate,
  normalizeDni,
  normalizeMoney,
  normalizeOperationalStatus,
  parseArgentinianDate,
  parseGoogleSheetDate,
  parseSheetDateToLocalDate,
  normalizeSheetText,
  toMemberStatus,
  memberFallbackIndexes,
  memberColumnAliases,
  resolveMemberColumnIndexes,
  memberValue,
  getPaymentsDebugFromGoogleSheets,
  getMembersFromGoogleSheets
} from "./legacy.js";

export type {
  MemberColumnKey,
  MemberColumnIndexes,
  MemberColumnIndexResolution,
  LastPaymentInfo,
  PaymentsDebugInfo
} from "./legacy.js";
