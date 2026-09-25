import { getPostgresPool } from "../db/postgres.js";

export type ReceivableRow = Record<string, unknown>;
export type ReceivableQuery = { clubId: string; limit: number; offset: number; sectorIds?: readonly string[]; dueFrom?: string; dueTo?: string; status?: string; personId?: string; enrollmentId?: string; activityId?:string; currencyCode?:string };

export const getReceivables = async ({ clubId, limit, offset, sectorIds, dueFrom, dueTo, status, personId, enrollmentId, activityId, currencyCode }: ReceivableQuery): Promise<{ rows: ReceivableRow[]; total: number }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<ReceivableRow & { total_count: string | number }>(`
    select r.*, coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0)::float8 as paid_amount,
      greatest(0,r.amount-r.cancelled_amount-coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0))::float8 as outstanding_amount,
      count(*) over() as total_count
    from miclub.receivables r
    where r.club_id = $1
      and ($2::date is null or r.due_date >= $2)
      and ($3::date is null or r.due_date <= $3)
      and ($4::text is null or r.status::text = $4)
      and ($5::uuid is null or r.person_id = $5)
      and ($6::uuid is null or r.enrollment_id = $6)
      and ($9::uuid[] is null or r.sector_id = any($9))
      and ($10::uuid is null or r.activity_id = $10)
      and ($11::text is null or r.currency_code = $11)
    order by r.due_date asc nulls last, r.created_at desc nulls last, r.id desc nulls last
    limit $7 offset $8
  `, [clubId, dueFrom ?? null, dueTo ?? null, status ?? null, personId ?? null, enrollmentId ?? null, limit, offset, sectorIds ?? null, activityId??null, currencyCode??null]);
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { rows: result.rows.map(({ total_count: _, ...row }) => row), total };
};
