/** Labels persisted by PostgreSQL's `miclub.movement_status` enum. */
export const MOVEMENT_OPERATIONAL_STATUSES = [
  "COMPLETADO",
  "PENDIENTE",
  "CANCELADO",
  "ANULADO",
] as const;

/** Closed operational contract: API consumers must not accept arbitrary strings. */
export type EconomyOperationalStatus = typeof MOVEMENT_OPERATIONAL_STATUSES[number];

export const isEconomyOperationalStatus = (value: unknown): value is EconomyOperationalStatus =>
  typeof value === "string"
  && (MOVEMENT_OPERATIONAL_STATUSES as readonly string[]).includes(value);

export const isCompletedMovementStatus = (value: EconomyOperationalStatus): boolean =>
  value === "COMPLETADO";

export const isPendingMovementStatus = (value: EconomyOperationalStatus): boolean =>
  value === "PENDIENTE";
