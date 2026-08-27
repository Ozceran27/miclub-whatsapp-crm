import type { QueryExecutor } from "../db/postgres.js";

export type NavigationSector = { id: string; name: string; code: string | null };

/**
 * A sector is navigable when it is not archived and its persisted operational
 * state is either unset (legacy/default-active) or the installed active
 * miclub.entity_status label, `activa`. Casting the column to text prevents
 * PostgreSQL from coercing API labels such as `active`/`inactive` into the enum.
 * Every explicit non-active state (`suspendida`, `cancelada`, etc.) is excluded.
 */
export async function listNavigableSectors(clubId: string, db: QueryExecutor): Promise<NavigationSector[]> {
  const result = await db.query<NavigationSector>(
    `select id, name, code from miclub.sectors
     where club_id=$1 and archived_at is null
       and (operational_status is null or operational_status::text = 'activa')
     order by name`,
    [clubId],
  );
  return result.rows;
}

