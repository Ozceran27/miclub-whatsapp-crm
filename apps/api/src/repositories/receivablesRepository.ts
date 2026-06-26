import { getPostgresPool } from "../db/postgres.js";

export type ReceivableRow = Record<string, unknown>;

export const getReceivables = async (): Promise<ReceivableRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<ReceivableRow>(`
    select *
    from miclub.receivables
    order by due_date asc nulls last, created_at desc nulls last, id desc nulls last
  `);
  return result.rows;
};
