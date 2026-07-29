import { getPostgresPool } from "../db/postgres.js";

export type PaymentRow = Record<string, unknown>;
export type PaymentQuery = { clubId: string; limit: number; offset: number; from?: string; to?: string; personId?: string; paymentMethodId?: string };

export const getPayments = async ({ clubId, limit, offset, from, to, personId, paymentMethodId }: PaymentQuery): Promise<{ rows: PaymentRow[]; total: number }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<PaymentRow & { total_count: string | number }>(`
    select
      p.*,
      coalesce(
        jsonb_agg(to_jsonb(pa) order by pa.id) filter (where pa is not null),
        '[]'::jsonb
      ) as allocations,
      count(*) over() as total_count
    from miclub.payments p
    left join miclub.payment_allocations pa on pa.payment_id = p.id and pa.club_id = p.club_id
    where p.club_id = $1
      and ($2::timestamptz is null or p.paid_at >= $2)
      and ($3::timestamptz is null or p.paid_at < $3)
      and ($4::uuid is null or p.person_id = $4)
      and ($5::uuid is null or p.payment_method_id = $5)
    group by p.id
    order by p.paid_at desc nulls last, p.created_at desc nulls last, p.id desc nulls last
    limit $6 offset $7
  `, [clubId, from ?? null, to ?? null, personId ?? null, paymentMethodId ?? null, limit, offset]);
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { rows: result.rows.map(({ total_count: _, ...row }) => row), total };
};
