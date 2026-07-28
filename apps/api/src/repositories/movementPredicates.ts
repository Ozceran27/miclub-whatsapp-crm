const sqlAlias = (alias: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Alias SQL inválido: ${alias}`);
  return alias;
};

/** Predicate for every ordinary financial aggregation. */
export const completedMovementPredicate = (alias = "m"): string =>
  `${sqlAlias(alias)}.operational_status = 'COMPLETADO'`;

/**
 * Approved pending rule.
 *
 * `financial_status = 'pendiente'` is import metadata, not an independent
 * eligibility signal. Requiring operational PENDIENTE prevents stale financial
 * data from reintroducing COMPLETADO, CANCELADO or ANULADO movements.
 */
export const pendingMovementPredicate = (alias = "m"): string =>
  `${sqlAlias(alias)}.operational_status = 'PENDIENTE'`;
