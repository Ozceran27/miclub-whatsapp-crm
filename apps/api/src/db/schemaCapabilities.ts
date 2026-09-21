import type { QueryExecutor } from './postgres.js';

/** Keeps legacy reads available while the versioned responsibility migration is pending. */
export async function hasActivityResponsibleEmployee(executor: Pick<QueryExecutor, 'query'>): Promise<boolean> {
  const result = await executor.query<{ available: boolean }>(`select exists(
    select 1 from pg_attribute
    where attrelid=to_regclass('miclub.activities')
      and attname='responsible_employee_id'
      and not attisdropped
  ) as available`);
  return Boolean(result.rows[0]?.available);
}

/** Prevents writes while a database still enforces the legacy Instructor guard. */
export async function hasCanonicalActivityMutationGuard(executor: Pick<QueryExecutor, 'query'>): Promise<boolean> {
  const result = await executor.query<{ available: boolean }>(`select exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='miclub' and p.proname='validate_activity_mutation'
      and p.prosrc like '%responsible_employee_id%'
      and p.prosrc not like '%canonical instructor_id%'
  ) as available`);
  return Boolean(result.rows[0]?.available);
}
