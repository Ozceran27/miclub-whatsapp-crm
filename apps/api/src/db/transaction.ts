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
