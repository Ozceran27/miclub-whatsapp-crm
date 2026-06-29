/**
 * Configuración y tipos compartidos del importador Google Sheets.
 *
 * Runtime legacy: getGoogleSheetsConfig y constantes de hojas/rangos que todavía
 * alimentan endpoints existentes en services/googleSheets.ts vía fachada.
 * Importación/migración: tipos de columnas y debug usados por scripts de import/auditoría.
 */
export {
  SHEET_NAMES,
  MOVEMENT_SHEET_NAMES,
  SECTOR_BALANCE_SHEET_NAMES,
  getGoogleSheetsConfig
} from "./legacy.js";

export type {
  MovementColumnKey,
  MemberColumnKey,
  MovementColumnIndexes,
  MemberColumnIndexes,
  MovementFallbackMode,
  MovementColumnIndexResolution,
  MemberColumnIndexResolution,
  LastPaymentInfo,
  PaymentsDebugInfo,
  SyncStatus,
  ClubFinanceDebugInfo,
  SectorOperationalDebugInfo
} from "./legacy.js";
