export { normalizeMembershipFeeUnit, normalizeReceivableAggregate, normalizeMovementAmount, normalizeMoneyAmount } from "./moneyNormalization.js";
export { MOVEMENT_OPERATIONAL_STATUSES, isCompletedMovementStatus, isEconomyOperationalStatus, isPendingMovementStatus } from "./movementStatus.js";
export { ACTIVE_MOVEMENT_CATEGORY_CODES, MOVEMENT_CATEGORY_CATALOG, MOVEMENT_CATEGORY_CLASSIFICATIONS } from "./movementCategoryCatalog.js";
export type { MovementCategoryClassification, MovementCategoryDirection } from "./movementCategoryCatalog.js";
export type { EconomyOperationalStatus } from "./movementStatus.js";

// Compatibility facade: domain contracts now live in focused modules.
export * from "./contracts/migration.js";
export * from "./contracts/members.js";
export * from "./contracts/economy.js";
export * from "./contracts/legacy.js";
export * from "./contracts/http.js";
export * from "./contracts/administration.js";
export * from "./contracts/auth.js";
export * from "./contracts/tasks.js";
export * from "./contracts/requests.js";
export * from "./contracts/onboarding.js";
export * from "./contracts/xlsxImport.js";
export * from "./contracts/capabilities.js";
export * from "./contracts/commercialPlans.js";
export * from "./contracts/activities.js";
export * from "./sectorVisualCatalog.js";
export * from "./activityVisualCatalog.js";
