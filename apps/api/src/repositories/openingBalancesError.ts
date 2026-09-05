type PostgresFailure = Error & { code?: string };

/** Converts PostgreSQL failures into a stable, frontend-safe domain error. */
export const translateOpeningBalancesError = (error: unknown): Error => {
  const postgresError = error as PostgresFailure | null;
  if (!postgresError?.code || !/^[0-9A-Z]{5}$/.test(postgresError.code)) {
    return error instanceof Error ? error : new Error("No se pudieron guardar los saldos iniciales.");
  }
  return Object.assign(
    new Error("No se pudieron guardar los saldos iniciales. Verificá los datos e intentá nuevamente."),
    { code: "OPENING_BALANCES_PERSISTENCE_ERROR", status: 422, expose: true, cause: error },
  );
};
