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

/**
 * Historical installations disagree on the identity referenced by
 * activities.updated_by: the original table points to people while the later
 * mutation migration points to users. User and Person UUIDs are never assumed
 * to be interchangeable.
 */
export async function resolveActivityMutationActorId(
  executor: Pick<QueryExecutor, 'query'>,
  actor: { userId: string; personId: string },
): Promise<string | null> {
  const result = await executor.query<{ referenced_table: string }>(`select referenced.relname as referenced_table
    from pg_constraint constraint_definition
    join pg_class activity on activity.oid=constraint_definition.conrelid
    join pg_namespace activity_namespace on activity_namespace.oid=activity.relnamespace
    join pg_class referenced on referenced.oid=constraint_definition.confrelid
    join pg_namespace referenced_namespace on referenced_namespace.oid=referenced.relnamespace
    where activity_namespace.nspname='miclub' and activity.relname='activities'
      and constraint_definition.conname='activities_updated_by_fkey'
      and constraint_definition.contype='f'
      and referenced_namespace.nspname='miclub'
    limit 1`);
  const target = result.rows[0]?.referenced_table;
  if (target === 'people') return actor.personId;
  if (target === 'users') return actor.userId;
  return null;
}
