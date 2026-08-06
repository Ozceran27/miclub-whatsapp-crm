import { normalizeComparableText } from "../importers/normalizers.js";
import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export const ACTIVITY_MUTATION_MODEL_MIGRATION = "202608060001_activity_mutation_model.sql";

export type ActivityActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export type ActivityInput = {
  sectorId: string; name: string; managerPersonId: string | null; instructorId?: string | null; code?: string | null;
  modality?: string | null; color?: string | null; monthlyFee?: number; clubCommissionPercent: number;
  instructorCommissionPercent?: number; maxCapacity?: number | null; status?: "active" | "inactive"; notes?: string | null;
};
export type ActivityRow = Record<string, unknown> & { id: string; updated_at: Date | string };
export type ActivityMutationResult =
  | { kind: "created" | "updated"; activity: ActivityRow }
  | { kind: "missing" | "conflict" | "model_not_applied" | "invalid_manager" | "invalid_sector" | "invalid_instructor" | "dependencies"; dependencies?: Record<string, number> };
type ActivityValidationFailure = "invalid_manager" | "invalid_sector" | "invalid_instructor";

const activityColumns = `id, club_id, sector_id, manager_person_id, instructor_id, code, name, modality, color,
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

export const createActivity = async (actor: ActivityActor, input: ActivityInput): Promise<ActivityMutationResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (executor) => {
    if (!await modelApplied(executor)) return { kind: "model_not_applied" };
    const invalid = await validReferences(executor, actor, input);
    if (invalid) return { kind: invalid };
    const result = await executor.query<ActivityRow>(`insert into miclub.activities
      (club_id, sector_id, manager_person_id, instructor_id, code, name, modality, color, monthly_fee, club_commission_percent, instructor_commission_percent, max_capacity, status, notes, updated_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::uuid) returning ${activityColumns}`,
    [actor.clubId, input.sectorId, input.managerPersonId, input.instructorId ?? null, input.code ?? null, input.name, input.modality ?? null,
      input.color ?? null, input.monthlyFee ?? 0, input.clubCommissionPercent, input.instructorCommissionPercent ?? 0, input.maxCapacity ?? null,
      input.status ?? "inactive", input.notes ?? null, actor.userId]);
    await auditActivity(actor, "activity.create", null, result.rows[0], executor);
    return { kind: "created", activity: result.rows[0] };
  }, pool);
};

const mutateExisting = async (actor: ActivityActor, id: string, expectedUpdatedAt: string, operation: "update" | "status" | "archive", input?: ActivityInput | { status: "active" | "inactive" }): Promise<ActivityMutationResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (executor) => {
    if (!await modelApplied(executor)) return { kind: "model_not_applied" };
    const current = await executor.query<ActivityRow>(`select ${activityColumns} from miclub.activities where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (operation === "archive") {
      const dependencyResult = await executor.query<{ enrollments: number; movements: number }>(`select
        (select count(*)::integer from miclub.enrollments where club_id=$1 and activity_id=$2) enrollments,
        (select count(*)::integer from miclub.movements where club_id=$1 and activity_id=$2) movements`, [actor.clubId, id]);
      const dependencies = dependencyResult.rows[0] ?? { enrollments: 0, movements: 0 };
      if (Object.values(dependencies).some((count) => Number(count) > 0)) return { kind: "dependencies", dependencies };
      const result = await executor.query<ActivityRow>(`update miclub.activities set status='archived', archived_at=now(), updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`, [actor.clubId, id, actor.userId]);
      if (!result.rows[0]) return { kind: "conflict" };
      await auditActivity(actor, "activity.archive", before, result.rows[0], executor);
      return { kind: "updated", activity: result.rows[0] };
    }
    if (operation === "status") {
      const status = (input as { status: "active" | "inactive" }).status;
      if (status === "active" && !before.manager_person_id) return { kind: "invalid_manager" };
      const result = await executor.query<ActivityRow>(`update miclub.activities set status=$3, updated_at=now(), updated_by=$4::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`, [actor.clubId, id, status, actor.userId]);
      if (!result.rows[0]) return { kind: "conflict" };
      await auditActivity(actor, "activity.status", before, result.rows[0], executor);
      return { kind: "updated", activity: result.rows[0] };
    }
    const value = input as ActivityInput;
    const invalid = await validReferences(executor, actor, value);
    if (invalid) return { kind: invalid };
    const result = await executor.query<ActivityRow>(`update miclub.activities set sector_id=$3, manager_person_id=$4, instructor_id=$5, code=$6, name=$7, modality=$8, color=$9, monthly_fee=$10, club_commission_percent=$11, instructor_commission_percent=$12, max_capacity=$13, status=$14, notes=$15, updated_at=now(), updated_by=$16::uuid where club_id=$1 and id=$2 and archived_at is null returning ${activityColumns}`,
    [actor.clubId, id, value.sectorId, value.managerPersonId, value.instructorId ?? null, value.code ?? null, value.name, value.modality ?? null, value.color ?? null, value.monthlyFee ?? 0, value.clubCommissionPercent, value.instructorCommissionPercent ?? 0, value.maxCapacity ?? null, value.status ?? "inactive", value.notes ?? null, actor.userId]);
    if (!result.rows[0]) return { kind: "conflict" };
    await auditActivity(actor, "activity.update", before, result.rows[0], executor);
    return { kind: "updated", activity: result.rows[0] };
  }, pool);
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
     values ($1, $2, $3, true, true, 'Importado desde Google Sheets') returning id`,
    [clubId, code, cleanName]
  );
  return result.rows[0]?.id ?? "";
};

export const upsertInstructor = async (pool: Pool, clubId: string, personId: string, displayName: string): Promise<string> => {
  await pool.query("insert into miclub.person_kind_links (club_id, person_id, kind) values ($1, $2, 'instructor') on conflict do nothing", [clubId, personId]);
  const result = await pool.query<{ id: string }>(
    `insert into miclub.instructors (club_id, person_id, display_name, notes)
     values ($1, $2, $3, 'Importado desde Google Sheets')
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
       values ($1, $2, $3, $4, $5, (select person_id from miclub.instructors where club_id=$1 and id=$5), $6, $7, 'Importado desde Google Sheets')
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
      input.monthlyFeeSource ?? "google_sheets_import",
      input.monthlyFeeRawText ?? null,
      input.monthlyFeeRawAmount ?? null,
      input.monthlyFeeNormalizationReason ?? null,
      input.importBatchId ?? null,
    ]
  );
  return result.rows[0]?.id ?? "";
};
