import { getPostgresPool } from "../db/postgres.js";

export type MovementRow = Record<string, unknown>;

export const getMovements = async (): Promise<MovementRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<MovementRow>(`
    select *
    from miclub.v_movements_enriched
    order by movement_date desc nulls last, created_at desc nulls last, id desc nulls last
  `);
  return result.rows;
};
