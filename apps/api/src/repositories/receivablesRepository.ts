import { getPostgresPool } from "../db/postgres.js";

export type ReceivableRow = Record<string, unknown>;

export const getReceivables = async (clubId: string): Promise<ReceivableRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<ReceivableRow>(`
    select *
    from miclub.receivables
    where club_id = $1
    order by due_date asc nulls last, created_at desc nulls last, id desc nulls last
  `, [clubId]);
  return result.rows;
};
