/**
 * Parsing de movimientos y utilidades de clasificación.
 *
 * Runtime legacy: getAdminMovementsFromGoogleSheets e isIncome/isExpense/isPending/isCompleted
 * alimentan cálculos financieros existentes.
 * Importación/migración: aliases, fallbacks y resolvers permiten mapear hojas históricas.
 */
export {
  movementColumnAliases,
  adminMovementFallbackIndexes,
  sectorMovementFallbackIndexes,
  movementFallbackIndexes,
  resolveMovementColumnIndexes,
  movementValue,
  isCompleted,
  isPending,
  isIncome,
  isExpense,
  getAdminMovementsFromGoogleSheets
} from "./legacy.js";

export type {
  MovementColumnKey,
  MovementColumnIndexes,
  MovementFallbackMode,
  MovementColumnIndexResolution
} from "./legacy.js";
