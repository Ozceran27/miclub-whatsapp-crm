import { getPostgresPool } from "../db/postgres.js";

export type PaymentRow = Record<string, unknown>;

export const getPayments = async (): Promise<PaymentRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<PaymentRow>(`
    select
      p.*,
      coalesce(
        jsonb_agg(to_jsonb(pa) order by pa.id) filter (where pa is not null),
        '[]'::jsonb
      ) as allocations
    from miclub.payments p
    left join miclub.payment_allocations pa on pa.payment_id = p.id
    group by p.id
    order by p.paid_at desc nulls last, p.created_at desc nulls last, p.id desc nulls last
  `);
  return result.rows;
};
