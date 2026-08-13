import { CLUB_CAPABILITIES, PERMISSIONS, type ClubCapability, type ClubCapabilityCode } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";

type CapabilityRow = {
  capability: ClubCapabilityCode;
  source: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  actor: string;
};

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/** Single source of truth for effective tenant product capabilities. */
export async function resolveClubCapabilities(
  clubId: string,
  executor?: QueryExecutor,
  now = new Date(),
): Promise<ClubCapability[]> {
  const db = executor ?? await getPostgresPool();
  const result = await db.query<CapabilityRow>(
    `select capability, source, effective_from, effective_until, actor
       from miclub.club_capabilities
      where club_id=$1 and effective_from <= $2
        and (effective_until is null or effective_until > $2)
      order by capability`,
    [clubId, now],
  );
  return result.rows.map((row) => ({
    code: row.capability,
    source: row.source,
    effectiveFrom: iso(row.effective_from),
    effectiveUntil: row.effective_until === null ? null : iso(row.effective_until),
    actor: row.actor,
  }));
}

export async function clubHasCapability(clubId: string, capability: ClubCapabilityCode): Promise<boolean> {
  const capabilities = await resolveClubCapabilities(clubId);
  return capabilities.some(({ code }) => code === capability);
}

export const DATA_MIGRATION_CAPABILITY = CLUB_CAPABILITIES.DATA_MIGRATION;

export const canRunDataMigration = (permissions: readonly string[], capabilities: readonly ClubCapability[]): boolean =>
  permissions.includes(PERMISSIONS.IMPORTS_RUN)
  && capabilities.some(({ code }) => code === CLUB_CAPABILITIES.DATA_MIGRATION);
