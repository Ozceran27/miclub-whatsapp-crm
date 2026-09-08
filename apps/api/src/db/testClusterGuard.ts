import type { QueryExecutor } from './postgres.js';

/** Destructive integration gates require a marker configured on the SERVER.
 * A test database name alone does not protect roles on a shared cluster. */
export async function assertIsolatedTestCluster(db: QueryExecutor): Promise<void> {
  const result = await db.query<{ marker: string | null }>(
    "select current_setting('miclub.test_cluster', true) as marker",
  );
  if (result.rows[0]?.marker !== 'release_candidate_isolated') {
    throw new Error('Integration requires a dedicated cluster with miclub.test_cluster=release_candidate_isolated; no destructive operations performed');
  }
}
