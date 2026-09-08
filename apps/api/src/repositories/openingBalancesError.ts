type PostgresFailure = Error & { code?: string; column?: string };

/** Converts PostgreSQL failures into a stable, frontend-safe domain error. */
export const translateOpeningBalancesError = (error: unknown): Error => {
  const postgresError = error as PostgresFailure | null;
  if (!postgresError?.code || !/^[0-9A-Z]{5}$/.test(postgresError.code)) {
    return error instanceof Error ? error : new Error("No se pudieron guardar los saldos iniciales.");
  }
  if (['42883','42P01','42703','42501'].includes(postgresError.code)
      || (postgresError.code === '23502' && postgresError.column === 'sequence_number')) {
    return Object.assign(new Error('La base de datos necesita una actualización para guardar los saldos iniciales. Contactá al administrador; no es necesario cambiar los importes.'), {
      code: 'ONBOARDING_SCHEMA_UNAVAILABLE', status: 503, expose: true, cause: error,
    });
  }
  return Object.assign(
    new Error("No se pudieron guardar los saldos iniciales. Verificá los datos e intentá nuevamente."),
    { code: "OPENING_BALANCES_PERSISTENCE_ERROR", status: 422, expose: true, cause: error },
  );
};
