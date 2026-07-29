import { getPostgresPool } from "../db/postgres.js";

export type MovementRow = Record<string, unknown>;
export type MovementFilters = { from?: string; to?: string; type?: string; status?: string; sectorId?: string; personId?: string };
export type MovementQuery = MovementFilters & { clubId: string; limit: number; offset: number };

export const getMovements = async ({ clubId, limit, offset, from, to, type, status, sectorId, personId }: MovementQuery): Promise<{ rows: MovementRow[]; total: number }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<MovementRow & { total_count: string | number }>(`
    select *, count(*) over() as total_count
    from miclub.v_movements_enriched
    where club_id = $1
      and ($2::timestamptz is null or movement_date >= $2)
      and ($3::timestamptz is null or movement_date < $3)
      and ($4::text is null or movement_type::text = $4)
      and ($5::text is null or operational_status::text = $5 or financial_status::text = $5)
      and ($6::uuid is null or sector_id = $6)
      and ($7::uuid is null or person_id = $7)
    order by movement_date desc nulls last, created_at desc nulls last, id desc nulls last
    limit $8 offset $9
  `, [clubId, from ?? null, to ?? null, type ?? null, status ?? null, sectorId ?? null, personId ?? null, limit, offset]);
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { rows: result.rows.map(({ total_count: _, ...row }) => row), total };
};
