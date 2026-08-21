import { getPostgresPool } from "../db/postgres.js";
import { calculateDynamicSettlementBalance, calculateOperationalBalances } from "./operationalBalancesCalculator.js";
import { getPostgresClubFinanceSummary } from "./postgresDashboardService.js";

const toNumber = (value: unknown): number => Number(value ?? 0) || 0;
const diff = (expected: number, calculated: number) => calculated - expected;

export const runPostgresAudit = async (clubId: string) => {
  const pool = await getPostgresPool();
  const [finance, movements, statuses, balances, settlements, pending] = await Promise.all([
    getPostgresClubFinanceSummary(clubId),
    pool.query<Record<string, unknown>>(`
      select movement_type, operational_status, count(*)::int as count, coalesce(sum(amount), 0) as amount
      from miclub.movements
      where club_id = $1
      group by movement_type, operational_status
      order by movement_type, operational_status`, [clubId]),
    pool.query<Record<string, unknown>>(`
      select status, count(*)::int as count, coalesce(sum(fee_amount), 0) as fee_amount
      from miclub.enrollments
      where club_id = $1
      group by status
      order by status`, [clubId]),
    pool.query<Record<string, unknown>>(`select * from miclub.operational_balances where club_id = $1 order by cutoff_date desc, created_at desc limit 1`, [clubId]),
    pool.query<Record<string, unknown>>(`
      select sector_id, sector_name, settlement_balance
      from miclub.v_activity_settlement_sector_balances
      where club_id = $1
      order by sector_id`, [clubId]),
    pool.query<Record<string, unknown>>(`
      select
        coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as income,
        coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as expenses,
        count(*) filter (where movement_type in ('INGRESOS','EGRESOS'))::int as movement_count,
        count(*) filter (where movement_type not in ('INGRESOS','EGRESOS'))::int as excluded_non_income_expense
      from miclub.v_movements_enriched
      where club_id = $1
        and coalesce(source_payload->>'sheet', '') = 'ADMINISTRACIÓN'
        and (operational_status = 'PENDIENTE'::miclub.movement_status or financial_status = 'pendiente'::miclub.financial_status)`, [clubId]),
  ]);

  const canonicalSettlements = calculateDynamicSettlementBalance(settlements.rows.map((row) => ({
    sectorId: String(row.sector_id), sectorName: String(row.sector_name), amount: toNumber(row.settlement_balance),
  })));
  const projected = calculateOperationalBalances({
    liquidity: finance.liquidity,
    feesToCollect: finance.cuotasACobrar,
    settlementBalance: finance.settlementBalance,
    pendingBalance: finance.pendingNetBalance,
  });
  return {
    ok: Math.abs(diff(projected.projectedBalance, finance.projectedBalance)) < 0.01,
    operationalBalances: {
      liquidity: finance.liquidity,
      feesToCollect: {
        total: finance.cuotasACobrar,
        source: finance.metadata?.cuotasACobrarSource,
        enrollmentCount: null,
      },
      settlementBalance: canonicalSettlements,
      pendingBalance: {
        income: toNumber(pending.rows[0]?.income),
        expenses: toNumber(pending.rows[0]?.expenses),
        net: finance.pendingNetBalance,
        movementCount: toNumber(pending.rows[0]?.movement_count),
        excludedNonIncomeExpense: toNumber(pending.rows[0]?.excluded_non_income_expense),
      },
      projectedBalance: finance.projectedBalance,
      formula: "liquidity + feesToCollect + settlementBalance + pendingBalance",
    },
    checks: {
      projectedBalance: {
        expected: projected.projectedBalance,
        calculated: finance.projectedBalance,
        difference: diff(projected.projectedBalance, finance.projectedBalance),
      },
      canonicalSettlementDifference: diff(-canonicalSettlements.total, finance.settlementBalance),
    },
    database: {
      movementTotals: movements.rows,
      enrollmentsByStatus: statuses.rows,
      latestOperationalBalance: balances.rows[0] ?? null,
      activitySettlementBalances: settlements.rows,
    },
  };
};
