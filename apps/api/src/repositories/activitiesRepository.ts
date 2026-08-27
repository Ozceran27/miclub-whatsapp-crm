import { normalizeComparableText } from "../importers/normalizers.js";
import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";
import type { ActivitySettlementMutation } from "@miclub/shared";
import { storedEntityStatus } from "./entityStatusRepository.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export const ACTIVITY_MUTATION_MODEL_MIGRATION = "202608060001_activity_mutation_model.sql";

export type ActivityActor = {
  userId: string; membershipId: string; clubId: string; sectorIds: readonly string[]; canAccessAnySector: boolean;
  requestId?: string; ip?: string; userAgent?: string;
};
export type ActivityInput = {
  sectorId: string; name: string; managerPersonId: string | null; instructorId?: string | null; code?: string | null;
  modality?: string | null; color?: string | null; iconKey?: string | null; enrollmentFee?: number; monthlyFee?: number; clubCommissionPercent: number;
  instructorCommissionPercent?: number; maxCapacity?: number | null; status?: "active" | "inactive"; notes?: string | null;
  settlement: ActivitySettlementMutation;
};
export type ActivityRow = Record<string, unknown> & { id: string; updated_at: Date | string };
export type ActivityMutationResult =
  | { kind: "created" | "updated"; activity: ActivityRow }
  | { kind: "missing" | "conflict" | "model_not_applied" | "invalid_manager" | "invalid_sector" | "invalid_instructor" | "dependencies" | "invalid_terms" | "settled_history"; dependencies?: Record<string, number> };
type ActivityValidationFailure = "invalid_manager" | "invalid_sector" | "invalid_instructor";
class InvalidActivityTermsError extends Error {}
const isTermsConstraintError = (error: unknown) => error instanceof InvalidActivityTermsError
  || (typeof error === "object" && error !== null && "code" in error && ["23P01", "23514"].includes(String(error.code)));

const activityColumns = `id, club_id, sector_id, manager_person_id, instructor_id, code, name, modality, color, icon_key,
  monthly_fee, club_commission_percent, instructor_commission_percent, max_capacity, status, notes, archived_at, created_at, updated_at`;

const modelApplied = async (executor: { query: Pool["query"] }): Promise<boolean> => {
  const result = await executor.query("select 1 from public.miclub_schema_migrations where name=$1", [ACTIVITY_MUTATION_MODEL_MIGRATION]);
  return Boolean(result.rows[0]);
};

const validReferences = async (executor: { query: Pool["query"] }, actor: ActivityActor, input: Pick<ActivityInput, "sectorId" | "managerPersonId" | "instructorId">): Promise<ActivityValidationFailure | null> => {
  const result = await executor.query<{ sector: boolean; manager: boolean; instructor: boolean }>(`
    select exists(select 1 from miclub.sectors where club_id=$1 and id=$2 and archived_at is null) sector,
      ($3::uuid is null or exists(select 1 from miclub.people where club_id=$1 and id=$3)) manager,
      ($4::uuid is null or exists(select 1 from miclub.instructors where club_id=$1 and id=$4)) instructor`,
  [actor.clubId, input.sectorId, input.managerPersonId, input.instructorId ?? null]);
  const row = result.rows[0];
  if (!row?.sector) return "invalid_sector";
  if (!row.manager) return "invalid_manager";
  if (!row.instructor) return "invalid_instructor";
  return null;
};

const auditActivity = (actor: ActivityActor, action: string, before: ActivityRow | null, after: ActivityRow, executor: Parameters<typeof auditService.sensitiveChange>[1]) =>
  auditService.sensitiveChange({ action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
    entityType: "activity", entityId: after.id, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent, oldData: before, newData: after }, executor);

type ActivityTermRow = Record<string, unknown> & { id: string; effective_from: string | Date; effective_to: string | Date | null };
const termColumns = "id, club_id, activity_id, mode, monthly_fixed_fee, club_share_percentage, effective_from, effective_to, created_at, updated_at";
const auditTerms = (actor: ActivityActor, action: string, activityId: string, before: ActivityTermRow | null, after: ActivityTermRow, executor: Parameters<typeof auditService.sensitiveChange>[1]) =>
  auditService.sensitiveChange({ action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
    entityType: "activity_terms", entityId: after.id, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
    oldData: before, newData: { ...after, activityId } }, executor);

export const createActivity = async (actor: ActivityActor, input: ActivityInput): Promise<ActivityMutationResult> => {
  const pool = await getPostgresPool();
  try { return await withTransaction(async (executor) => {
    if (!await modelApplied(executor)) return { kind: "model_not_applied" };
    const invalid = await validReferences(executor, actor, input);
    if (invalid) return { kind: invalid };
    const result = await executor.query<ActivityRow>(`insert into miclub.activities
      (club_id, sector_id, manager_person_id, instructor_id, code, name, modality, color, icon_key, monthly_fee, club_commission_percent, instructor_commission_percent, max_capacity, status, notes, updated_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::uuid) returning ${activityColumns}`,
    [actor.clubId, input.sectorId, input.managerPersonId, input.instructorId ?? null, input.code ?? null, input.name, input.modality ?? null,
      input.color ?? null, input.iconKey ?? null, input.enrollmentFee ?? input.monthlyFee ?? 0, input.clubCommissionPercent, input.instructorCommissionPercent ?? 0, input.maxCapacity ?? null,
      storedEntityStatus(input.status ?? "inactive"), input.notes ?? null, actor.userId]);
    const term = await executor.query<ActivityTermRow>(`insert into miclub.activity_terms
      (club_id, activity_id, mode, monthly_fixed_fee, club_share_percentage, effective_from, created_by, updated_by)
      values ($1,$2,$3,$4,$5,$6::date,$7::uuid,$7::uuid) returning ${termColumns}`,
    [actor.clubId, result.rows[0].id, input.settlement.mode, input.settlement.monthlyFixedFee, input.settlement.clubSharePercentage, input.settlement.effectiveFrom, actor.userId]);
    await auditActivity(actor, "activity.create", null, result.rows[0], executor);
    await auditTerms(actor, "activity_terms.create", result.rows[0].id, null, term.rows[0], executor);
    return { kind: "created", activity: result.rows[0] };
  }, pool); } catch (error) {
    if (isTermsConstraintError(error)) return { kind: "invalid_terms" };
    throw error;
  }
};

const mutateExisting = async (actor: ActivityActor, id: string, expectedUpdatedAt: string, operation: "update" | "status" | "archive", input?: ActivityInput | { status: "active" | "inactive" }): Promise<ActivityMutationResult> => {
  const pool = await getPostgresPool();
  try { return await withTransaction(async (executor) => {
    if (!await modelApplied(executor)) return { kind: "model_not_applied" };
    const current = await executor.query<ActivityRow>(`select ${activityColumns} from miclub.activities
      where club_id=$1 and id=$2 and ($3::boolean or sector_id = any($4::uuid[])) for update`,
    [actor.clubId, id, actor.canAccessAnySector, actor.sectorIds]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (operation === "archive") {
      const result = await executor.query<ActivityRow>(`update miclub.activities set status='cancelada', archived_at=now(), updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`, [actor.clubId, id, actor.userId]);
      if (!result.rows[0]) return { kind: "conflict" };
      await auditActivity(actor, "activity.archive", before, result.rows[0], executor);
      return { kind: "updated", activity: result.rows[0] };
    }
    if (operation === "status") {
      const status = (input as { status: "active" | "inactive" }).status;
      if (status === "active" && !before.instructor_id) return { kind: "invalid_instructor" };
      const result = await executor.query<ActivityRow>(`update miclub.activities set status=$3, updated_at=now(), updated_by=$4::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`, [actor.clubId, id, storedEntityStatus(status), actor.userId]);
      if (!result.rows[0]) return { kind: "conflict" };
      await auditActivity(actor, "activity.status", before, result.rows[0], executor);
      return { kind: "updated", activity: result.rows[0] };
    }
    const value = input as ActivityInput;
    // A reassignment requires access to both ends. The current sector was checked
    // by the authorized lookup above; do not reveal whether an inaccessible target exists.
    if (!actor.canAccessAnySector && !actor.sectorIds.includes(value.sectorId)) return { kind: "missing" };
    const invalid = await validReferences(executor, actor, value);
    if (invalid) return { kind: invalid };
    const terms = await executor.query<ActivityTermRow>(`select ${termColumns} from miclub.activity_terms
      where club_id=$1 and activity_id=$2 order by effective_from for update`, [actor.clubId, id]);
    const latest = terms.rows.at(-1);
    if (!latest || latest.effective_to !== null || value.settlement.effectiveFrom <= String(latest.effective_from).slice(0, 10)) return { kind: "invalid_terms" };
    const settled = await executor.query<{ locked: boolean }>(`select exists(select 1 from miclub.activity_settlements
      where club_id=$1 and activity_id=$2 and voided_at is null and status='COMPLETADO' and period_to >= $3::date) locked`,
    [actor.clubId, id, value.settlement.effectiveFrom]);
    if (settled.rows[0]?.locked) return { kind: "settled_history" };
    const result = await executor.query<ActivityRow>(`update miclub.activities set sector_id=$3, manager_person_id=$4, instructor_id=$5, code=$6, name=$7, modality=$8, color=$9, icon_key=$10, monthly_fee=$11, club_commission_percent=$12, instructor_commission_percent=$13, max_capacity=$14, status=$15, notes=$16, updated_at=now(), updated_by=$17::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`,
    [actor.clubId, id, value.sectorId, value.managerPersonId, value.instructorId ?? null, value.code ?? null, value.name, value.modality ?? null, value.color ?? null, value.iconKey ?? null, value.enrollmentFee ?? value.monthlyFee ?? 0, value.clubCommissionPercent, value.instructorCommissionPercent ?? 0, value.maxCapacity ?? null, storedEntityStatus(value.status ?? "inactive"), value.notes ?? null, actor.userId]);
    if (!result.rows[0]) return { kind: "conflict" };
    const closed = await executor.query<ActivityTermRow>(`update miclub.activity_terms set effective_to=$3::date - 1,
      updated_at=now(), updated_by=$4::uuid where club_id=$1 and id=$2 and effective_to is null returning ${termColumns}`,
    [actor.clubId, latest.id, value.settlement.effectiveFrom, actor.userId]);
    if (!closed.rows[0]) throw new InvalidActivityTermsError("The current term changed while it was being versioned");
    const inserted = await executor.query<ActivityTermRow>(`insert into miclub.activity_terms
      (club_id, activity_id, mode, monthly_fixed_fee, club_share_percentage, effective_from, created_by, updated_by)
      values ($1,$2,$3,$4,$5,$6::date,$7::uuid,$7::uuid) returning ${termColumns}`,
    [actor.clubId, id, value.settlement.mode, value.settlement.monthlyFixedFee, value.settlement.clubSharePercentage, value.settlement.effectiveFrom, actor.userId]);
    await auditTerms(actor, "activity_terms.close", id, latest, closed.rows[0], executor);
    await auditTerms(actor, "activity_terms.create", id, null, inserted.rows[0], executor);
    await auditActivity(actor, "activity.update", before, result.rows[0], executor);
    return { kind: "updated", activity: result.rows[0] };
  }, pool); } catch (error) {
    if (isTermsConstraintError(error)) return { kind: "invalid_terms" };
    throw error;
  }
};

export const updateActivity = (actor: ActivityActor, id: string, version: string, input: ActivityInput) => mutateExisting(actor, id, version, "update", input);
export const setActivityStatus = (actor: ActivityActor, id: string, version: string, status: "active" | "inactive") => mutateExisting(actor, id, version, "status", { status });
export const archiveActivity = (actor: ActivityActor, id: string, version: string) => mutateExisting(actor, id, version, "archive");
const codeFromName = (value: string): string => normalizeComparableText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "SIN_CODIGO";

export const upsertSector = async (pool: Pool, clubId: string, name: string): Promise<string> => {
  const cleanName = name.trim() || "Sin sector";
  const code = codeFromName(cleanName);
  const existing = await pool.query<{ id: string }>("select id from miclub.sectors where club_id=$1 and (lower(name)=lower($2) or lower(code)=lower($3)) limit 1", [clubId, cleanName, code]);
  if (existing.rows[0]) return existing.rows[0].id;
  const result = await pool.query<{ id: string }>(
    `insert into miclub.sectors (club_id, code, name, uses_enrollments, uses_activities, notes)
     values ($1, $2, $3, true, true, 'Importado desde lote XLSX') returning id`,
    [clubId, code, cleanName]
  );
  return result.rows[0]?.id ?? "";
};

export const upsertInstructor = async (pool: Pool, clubId: string, personId: string, displayName: string): Promise<string> => {
  await pool.query("insert into miclub.person_kind_links (club_id, person_id, kind) values ($1, $2, 'instructor') on conflict do nothing", [clubId, personId]);
  const result = await pool.query<{ id: string }>(
    `insert into miclub.instructors (club_id, person_id, display_name, notes)
     values ($1, $2, $3, 'Importado desde lote XLSX')
     on conflict (club_id, person_id) do update set display_name = excluded.display_name, updated_at = now()
     returning id`,
    [clubId, personId, displayName]
  );
  return result.rows[0]?.id ?? "";
};

export const upsertActivity = async (pool: Pool, input: {
  clubId: string;
  sectorId: string;
  name: string;
  modality?: string | null;
  instructorId: string;
  monthlyFee?: number;
  monthlyFeeSource?: string | null;
  monthlyFeeRawText?: string | null;
  monthlyFeeRawAmount?: number;
  monthlyFeeNormalizationReason?: string | null;
  clubCommissionPercent?: number;
  importBatchId?: string | null;
}): Promise<string> => {
  const activityName = input.name.trim() || "Sin actividad";
  const hasNormalizedMonthlyFee = input.monthlyFee !== undefined && Number.isFinite(input.monthlyFee);
  const result = await pool.query<{ id: string }>(
    `with previous_activity as (
       select id, monthly_fee
       from miclub.activities
       where club_id = $1
         and sector_id = $2
         and lower(name) = lower($3)
         and coalesce(modality, ''::text) = coalesce($4::text, ''::text)
       for update
     ), upserted_activity as (
       insert into miclub.activities (club_id, sector_id, name, modality, instructor_id, manager_person_id, monthly_fee, club_commission_percent, notes)
       values ($1, $2, $3, $4, $5, (select person_id from miclub.instructors where club_id=$1 and id=$5), $6, $7, 'Importado desde lote XLSX')
       on conflict (club_id, sector_id, lower(name), coalesce(modality, ''::text)) do update
         set instructor_id = excluded.instructor_id,
             manager_person_id = coalesce(miclub.activities.manager_person_id, excluded.manager_person_id),
             monthly_fee = case
               when $8::boolean then excluded.monthly_fee
               else miclub.activities.monthly_fee
             end,
             club_commission_percent = case
               when $9::boolean then excluded.club_commission_percent
               else miclub.activities.club_commission_percent
             end,
             updated_at = now()
       returning id, monthly_fee
     ), fee_audit as (
       insert into miclub.activity_fee_history (club_id, activity_id, previous_monthly_fee, new_monthly_fee, source, raw_fee_amount_text, raw_fee_amount, normalization_reason, import_batch_id)
       select $1, upserted_activity.id, previous_activity.monthly_fee, upserted_activity.monthly_fee, $10, $11, $12, $13, $14
       from upserted_activity
       join previous_activity on previous_activity.id = upserted_activity.id
       where $8::boolean
         and previous_activity.monthly_fee is distinct from upserted_activity.monthly_fee
       on conflict do nothing
     )
     select id from upserted_activity`,
    [
      input.clubId,
      input.sectorId,
      activityName,
      input.modality ?? null,
      input.instructorId,
      input.monthlyFee ?? 0,
      input.clubCommissionPercent ?? 0,
      hasNormalizedMonthlyFee,
      input.clubCommissionPercent !== undefined,
      input.monthlyFeeSource ?? "xlsx_import",
      input.monthlyFeeRawText ?? null,
      input.monthlyFeeRawAmount ?? null,
      input.monthlyFeeNormalizationReason ?? null,
      input.importBatchId ?? null,
    ]
  );
  return result.rows[0]?.id ?? "";
};
