import { getPostgresPool } from "../db/postgres.js";

export type DashboardRow = Record<string, unknown>;
export type SectorFinanceSummaryRow = Record<string, unknown>;

export const getDashboardBasic = async (clubId: string): Promise<DashboardRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<DashboardRow>(`
    select *
    from miclub.v_dashboard_basic
    where club_id = $1
  `, [clubId]);
  return result.rows;
};

export const getSectorFinanceSummary = async (clubId: string): Promise<SectorFinanceSummaryRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<SectorFinanceSummaryRow>(`
    select *
    from miclub.v_sector_finance_summary
    where club_id = $1
    order by sector_name asc nulls last, sector_id asc nulls last
  `, [clubId]);
  return result.rows;
};
