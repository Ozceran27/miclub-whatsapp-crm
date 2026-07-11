import { getPostgresPool } from "../db/postgres.js";
import { calculateOperationalBalances, calculateSettlementBalance } from "./operationalBalancesCalculator.js";
import { getPostgresClubFinanceSummary } from "./postgresDashboardService.js";

const toNumber = (value: unknown): number => Number(value ?? 0) || 0;
const diff = (expected: number, calculated: number) => calculated - expected;

export const runPostgresAudit = async () => {
  const pool = await getPostgresPool();
  const [finance, movements, statuses, balances, snapshots, pending] = await Promise.all([
    getPostgresClubFinanceSummary(),
    pool.query<Record<string, unknown>>(`
      select movement_type, operational_status, count(*)::int as count, coalesce(sum(amount), 0) as amount
      from miclub.movements
      group by movement_type, operational_status
      order by movement_type, operational_status`),
    pool.query<Record<string, unknown>>(`
      select status, count(*)::int as count, coalesce(sum(fee_amount), 0) as fee_amount
      from miclub.enrollments
      group by status
      order by status`),
    pool.query<Record<string, unknown>>(`select * from miclub.operational_balances order by cutoff_date desc, created_at desc limit 1`),
    pool.query<Record<string, unknown>>(`
      select distinct on (metric_key) metric_key, metric_value, source_range, captured_at
      from miclub.sheet_metric_snapshots
      where metric_key = any($1::text[])
      order by metric_key, captured_at desc`, [["fitness.settlement_balance", "salon.settlement_balance", "aula.settlement_balance", "local1.settlement_balance"]]),
    pool.query<Record<string, unknown>>(`
      select
        coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as income,
        coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as expenses,
        count(*) filter (where movement_type in ('INGRESOS','EGRESOS'))::int as movement_count,
        count(*) filter (where movement_type not in ('INGRESOS','EGRESOS'))::int as excluded_non_income_expense
      from miclub.v_movements_enriched
      where coalesce(source_payload->>'sheet', '') = 'ADMINISTRACIÓN'
        and (operational_status = 'PENDIENTE'::miclub.movement_status or financial_status = 'pendiente'::miclub.financial_status)`),
  ]);

  const snapshotSettlements = calculateSettlementBalance(snapshots.rows.map((row) => ({
    sector: String(row.metric_key).split(".")[0],
    amount: row.metric_value,
  })));
  const projected = calculateOperationalBalances({
    liquidity: finance.liquidity,
    feesToCollect: finance.cuotasACobrar,
    settlementBalance: finance.settlementBalance,
    pendingBalance: finance.pendingNetBalance,
  });
  const requiredSnapshots = ["fitness.settlement_balance", "salon.settlement_balance", "aula.settlement_balance", "local1.settlement_balance"];
  const snapshotKeys = new Set(snapshots.rows.map((item) => String(item.metric_key)));

  return {
    ok: Math.abs(diff(projected.projectedBalance, finance.projectedBalance)) < 0.01,
    operationalBalances: {
      liquidity: finance.liquidity,
      feesToCollect: {
        total: finance.cuotasACobrar,
        source: finance.metadata?.cuotasACobrarSource,
        enrollmentCount: null,
      },
      settlementBalance: snapshotSettlements,
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
      missingSheetMetricSnapshots: requiredSnapshots.filter((key) => !snapshotKeys.has(key)),
    },
    database: {
      movementTotals: movements.rows,
      enrollmentsByStatus: statuses.rows,
      latestOperationalBalance: balances.rows[0] ?? null,
      latestSettlementSnapshots: snapshots.rows,
    },
  };
};
