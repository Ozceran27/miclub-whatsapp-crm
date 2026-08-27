/**
 * Persistence labels for miclub.entity_status. API DTOs deliberately use
 * English labels, but those values must never be passed to an entity_status
 * column (or used as untyped enum comparison literals).
 */
export type ApiBinaryStatus = "active" | "inactive";
export type StoredEntityStatus = "activa" | "suspendida";

export const storedEntityStatus = (status: ApiBinaryStatus): StoredEntityStatus =>
  status === "active" ? "activa" : "suspendida";

