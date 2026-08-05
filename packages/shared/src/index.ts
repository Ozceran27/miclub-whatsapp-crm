export { normalizeMembershipFeeUnit, normalizeReceivableAggregate, normalizeMovementAmount, normalizeMoneyAmount } from "./moneyNormalization.js";
export { MOVEMENT_OPERATIONAL_STATUSES, isCompletedMovementStatus, isEconomyOperationalStatus, isPendingMovementStatus } from "./movementStatus.js";
export type { EconomyOperationalStatus } from "./movementStatus.js";

// Compatibility facade: domain contracts now live in focused modules.
export * from "./contracts/migration.js";
export * from "./contracts/members.js";
export * from "./contracts/economy.js";
export * from "./contracts/legacy.js";
export * from "./contracts/http.js";
export * from "./contracts/administration.js";
export * from "./contracts/auth.js";
