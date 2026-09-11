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

/** Navigation and authorization share the same effective feature resolution. */
export async function resolveClubCapabilities(
  clubId: string,
  executor?: QueryExecutor,
  now?: Date,
): Promise<ClubCapability[]> {
  const results = await Promise.all(Object.values(CLUB_CAPABILITIES).map(code => resolveFeature(clubId, code, executor, now)));
  return results.filter((row): row is CapabilityRow & { enabled: boolean } => row?.enabled === true).map((row) => ({
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
async function resolveFeature(
  clubId: string,
  featureCode: ClubCapabilityCode,
  executor?: QueryExecutor,
  now?: Date,
): Promise<(CapabilityRow & { enabled: boolean }) | undefined> {
  const db = executor ?? await getPostgresPool();
  const result = await db.query<CapabilityRow & { enabled: boolean }>(
    `with current_override as (
       select enabled, source, effective_from, effective_until, actor
         from miclub.club_capabilities
        where club_id=$1 and capability=$2 and effective_from <= coalesce($3::timestamptz,statement_timestamp())
          and (effective_until is null or effective_until > coalesce($3::timestamptz,statement_timestamp()))
        order by effective_from desc, created_at desc
        limit 1
     ), entitled as (
       select true as enabled, 'plan:' || subscription.plan_code as source,
              subscription.effective_from, subscription.effective_until, 'subscription'::text as actor
         from miclub.club_subscriptions subscription
         join miclub.plan_entitlements entitlement on entitlement.plan_code=subscription.plan_code
        where subscription.club_id=$1 and entitlement.feature_code=$2
          and subscription.effective_from <= coalesce($3::timestamptz,statement_timestamp())
          and (subscription.effective_until is null or subscription.effective_until > coalesce($3::timestamptz,statement_timestamp()))
          and subscription.billing_status='active'
        order by subscription.effective_from desc, subscription.id desc
        limit 1
     )
     select coalesce((select enabled from current_override),
                     (select enabled from entitled), false) as enabled,
            $2::text as capability,
            coalesce((select source from current_override),(select source from entitled)) as source,
            coalesce((select effective_from from current_override),(select effective_from from entitled)) as effective_from,
            case when exists(select 1 from current_override) then (select effective_until from current_override)
                 else (select effective_until from entitled) end as effective_until,
            coalesce((select actor from current_override),(select actor from entitled)) as actor`,
    [clubId, featureCode, now],
  );
  return result.rows[0];
}

export async function hasFeature(clubId: string, featureCode: ClubCapabilityCode, executor?: QueryExecutor, now?: Date): Promise<boolean> {
  return (await resolveFeature(clubId, featureCode, executor, now))?.enabled === true;
}

/** Compatibility name for callers while product language migrates to features. */
export const clubHasCapability = hasFeature;

export const DATA_MIGRATION_CAPABILITY = CLUB_CAPABILITIES.DATA_MIGRATION;

export const canRunDataMigration = (permissions: readonly string[], capabilities: readonly ClubCapability[]): boolean =>
  permissions.includes(PERMISSIONS.IMPORTS_RUN)
  && capabilities.some(({ code }) => code === CLUB_CAPABILITIES.DATA_MIGRATION);
