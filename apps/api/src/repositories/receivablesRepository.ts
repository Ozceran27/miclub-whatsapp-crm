import { getPostgresPool } from "../db/postgres.js";

export type ReceivableRow = Record<string, unknown>;
export type ReceivableQuery = { clubId: string; limit: number; offset: number; dueFrom?: string; dueTo?: string; status?: string; personId?: string; enrollmentId?: string };

export const getReceivables = async ({ clubId, limit, offset, dueFrom, dueTo, status, personId, enrollmentId }: ReceivableQuery): Promise<{ rows: ReceivableRow[]; total: number }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<ReceivableRow & { total_count: string | number }>(`
    select *, count(*) over() as total_count
    from miclub.receivables
    where club_id = $1
      and ($2::date is null or due_date >= $2)
      and ($3::date is null or due_date <= $3)
      and ($4::text is null or status::text = $4)
      and ($5::uuid is null or person_id = $5)
      and ($6::uuid is null or enrollment_id = $6)
    order by due_date asc nulls last, created_at desc nulls last, id desc nulls last
    limit $7 offset $8
  `, [clubId, dueFrom ?? null, dueTo ?? null, status ?? null, personId ?? null, enrollmentId ?? null, limit, offset]);
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { rows: result.rows.map(({ total_count: _, ...row }) => row), total };
};
