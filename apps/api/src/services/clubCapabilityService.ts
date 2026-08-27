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

/** Returns effective manual overrides for diagnostics and navigation metadata. */
export async function resolveClubCapabilities(
  clubId: string,
  executor?: QueryExecutor,
  now = new Date(),
): Promise<ClubCapability[]> {
  const db = executor ?? await getPostgresPool();
  const result = await db.query<CapabilityRow>(
    `select capability, source, effective_from, effective_until, actor
       from (
         select distinct on (capability) capability, source, effective_from,
                effective_until, actor, enabled
           from miclub.club_capabilities
          where club_id=$1 and effective_from <= $2
            and (effective_until is null or effective_until > $2)
          order by capability, effective_from desc, created_at desc
       ) current_overrides
      where enabled
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

/**
 * Single source of truth for plan features. The newest currently-effective
 * override wins; otherwise a current subscription must carry the entitlement.
 */
export async function hasFeature(
  clubId: string,
  featureCode: ClubCapabilityCode,
  executor?: QueryExecutor,
  now = new Date(),
): Promise<boolean> {
  const db = executor ?? await getPostgresPool();
  const result = await db.query<{ enabled: boolean }>(
    `with current_override as (
       select enabled
         from miclub.club_capabilities
        where club_id=$1 and capability=$2 and effective_from <= $3
          and (effective_until is null or effective_until > $3)
        order by effective_from desc, created_at desc
        limit 1
     ), entitled as (
       select true as enabled
         from miclub.club_subscriptions subscription
         join miclub.plan_entitlements entitlement on entitlement.plan_code=subscription.plan_code
        where subscription.club_id=$1 and entitlement.feature_code=$2
          and subscription.effective_from <= $3
          and (subscription.effective_until is null or subscription.effective_until > $3)
          and subscription.billing_status='active'
        limit 1
     )
     select coalesce((select enabled from current_override),
                     (select enabled from entitled), false) as enabled`,
    [clubId, featureCode, now],
  );
  return result.rows[0]?.enabled === true;
}

/** Compatibility name for callers while product language migrates to features. */
export const clubHasCapability = hasFeature;

export const DATA_MIGRATION_CAPABILITY = CLUB_CAPABILITIES.DATA_MIGRATION;

export const canRunDataMigration = (permissions: readonly string[], capabilities: readonly ClubCapability[]): boolean =>
  permissions.includes(PERMISSIONS.IMPORTS_RUN)
  && capabilities.some(({ code }) => code === CLUB_CAPABILITIES.DATA_MIGRATION);
