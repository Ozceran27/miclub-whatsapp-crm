import type { getPostgresPool } from "../db/postgres.js";
import { normalizeComparableText } from "../importers/normalizers.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
const codeFromName = (value: string): string => normalizeComparableText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "SIN_CODIGO";

export const upsertSector = async (pool: Pool, name: string): Promise<string> => {
  const cleanName = name.trim() || "Sin sector";
  const code = codeFromName(cleanName);
  const existing = await pool.query<{ id: string }>("select id from miclub.sectors where lower(name)=lower($1) or lower(code)=lower($2) limit 1", [cleanName, code]);
  if (existing.rows[0]) return existing.rows[0].id;
  const result = await pool.query<{ id: string }>(
    `insert into miclub.sectors (code, name, uses_enrollments, uses_activities, notes)
     values ($1, $2, true, true, 'Importado desde Google Sheets') returning id`,
    [code, cleanName]
  );
  return result.rows[0]?.id ?? "";
};

export const upsertInstructor = async (pool: Pool, personId: string, displayName: string): Promise<string> => {
  await pool.query("insert into miclub.person_kind_links (person_id, kind) values ($1, 'instructor') on conflict do nothing", [personId]);
  const result = await pool.query<{ id: string }>(
    `insert into miclub.instructors (person_id, display_name, notes)
     values ($1, $2, 'Importado desde Google Sheets')
     on conflict (person_id) do update set display_name = excluded.display_name, updated_at = now()
     returning id`,
    [personId, displayName]
  );
  return result.rows[0]?.id ?? "";
};

export const upsertActivity = async (pool: Pool, input: {
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
       where sector_id = $1
         and name = $2
         and coalesce(modality, ''::text) = coalesce($3::text, ''::text)
       for update
     ), upserted_activity as (
       insert into miclub.activities (sector_id, name, modality, instructor_id, monthly_fee, club_commission_percent, notes)
       values ($1, $2, $3, $4, $5, $6, 'Importado desde Google Sheets')
       on conflict (sector_id, name, coalesce(modality, ''::text)) do update
         set instructor_id = excluded.instructor_id,
             monthly_fee = case
               when $7::boolean then excluded.monthly_fee
               else miclub.activities.monthly_fee
             end,
             club_commission_percent = case
               when $8::boolean then excluded.club_commission_percent
               else miclub.activities.club_commission_percent
             end,
             updated_at = now()
       returning id, monthly_fee
     ), fee_audit as (
       insert into miclub.activity_fee_history (activity_id, previous_monthly_fee, new_monthly_fee, source, raw_fee_amount_text, raw_fee_amount, normalization_reason, import_batch_id)
       select upserted_activity.id, previous_activity.monthly_fee, upserted_activity.monthly_fee, $9, $10, $11, $12, $13
       from upserted_activity
       join previous_activity on previous_activity.id = upserted_activity.id
       where $7::boolean
         and previous_activity.monthly_fee is distinct from upserted_activity.monthly_fee
       on conflict do nothing
     )
     select id from upserted_activity`,
    [
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
