/**
 * Métricas operativas por sector.
 *
 * Runtime legacy: getters async de balances/utilidades/stats siguen soportando endpoints actuales.
 * Importación/migración: parsers puros y agregadores ayudan a auditar equivalencia de datos.
 */
export {
  normalizeStatus,
  isActiveMember,
  isCategory,
  isSector,
  isWithinLastDays,
  parseCurrentMonthUtility,
  getSectorBalance,
  getCurrentMonthUtility,
  parseAulaCommissionAverage,
  getSalonActivityStats,
  getAulaCommissionAverage,
  getLocal1Stats,
  getCantinaStatsFromAdminMovements,
  getSectorOperationalSummary,
  getSectorOperationalDebug
} from "./legacy.js";

export type { SectorOperationalDebugInfo } from "./legacy.js";
