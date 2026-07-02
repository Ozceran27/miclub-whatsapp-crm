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

export const upsertActivity = async (pool: Pool, input: { sectorId: string; name: string; modality?: string | null; instructorId: string; monthlyFee?: number; clubCommissionPercent?: number }): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `insert into miclub.activities (sector_id, name, modality, instructor_id, monthly_fee, club_commission_percent, notes)
     values ($1, $2, $3, $4, $5, $6, 'Importado desde Google Sheets')
     on conflict (sector_id, name, coalesce(modality, ''::text)) do update
       set instructor_id = excluded.instructor_id,
           monthly_fee = greatest(miclub.activities.monthly_fee, excluded.monthly_fee),
           club_commission_percent = case
             when $7::boolean then excluded.club_commission_percent
             else miclub.activities.club_commission_percent
           end,
           updated_at = now()
     returning id`,
    [input.sectorId, input.name.trim() || "Sin actividad", input.modality ?? null, input.instructorId, input.monthlyFee ?? 0, input.clubCommissionPercent ?? 0, input.clubCommissionPercent !== undefined]
  );
  return result.rows[0]?.id ?? "";
};
