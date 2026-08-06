import { getPostgresPool, type PgPool, type QueryExecutor } from "./postgres.js";

/** Runs all callback queries on one client and always returns it to the pool. */
export const withTransaction = async <T>(
  callback: (executor: QueryExecutor) => Promise<T>,
  pool?: Pick<PgPool, "connect">,
): Promise<T> => {
  const db = pool ?? await getPostgresPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Transaction boundary for queries executed as an RLS-protected application role.
 * Repositories must keep their explicit club_id predicates: this setting is a
 * second, database-enforced boundary and is intentionally transaction-local.
 */
export const withTenantTransaction = async <T>(
  clubId: string,
  callback: (executor: QueryExecutor) => Promise<T>,
  pool?: Pick<PgPool, "connect">,
): Promise<T> => withTransaction(async (executor) => {
  // set_config with true is SET LOCAL while keeping the value parameterized.
  await executor.query("SELECT set_config('app.club_id', $1, true)", [clubId]);
  return callback(executor);
}, pool);
