import type { QueryExecutor } from "../db/postgres.js";

export type NavigationSector = { id: string; name: string; code: string | null };

/**
 * `sectors.status` is the canonical administrative lifecycle. The legacy
 * operational_status column remains only for installations pending backfill.
 */
export async function listNavigableSectors(clubId: string, db: QueryExecutor): Promise<NavigationSector[]> {
  const result = await db.query<NavigationSector>(
    `select id, name, code from miclub.sectors
     where club_id=$1 and archived_at is null
       and status='active'
       and not (is_system and code in ('administracion','tesoreria'))
     order by name`,
    [clubId],
  );
  return result.rows;
}

