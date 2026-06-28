import { getPostgresPool } from "../db/postgres.js";

const toNumber = (value: unknown): number => Number(value ?? 0) || 0;
const diff = (expected: number, calculated: number) => calculated - expected;

export const runPostgresAudit = async () => {
  const pool = await getPostgresPool();
  const [dashboard, movements, sectors, categories, statuses, balances, snapshots] = await Promise.all([
    pool.query<Record<string, unknown>>("select * from miclub.v_dashboard_basic limit 1"),
    pool.query<Record<string, unknown>>(`
      select movement_type, operational_status, count(*)::int as count, coalesce(sum(amount), 0) as amount
      from miclub.movements
      group by movement_type, operational_status
      order by movement_type, operational_status`),
    pool.query<Record<string, unknown>>(`
      select sector_name, movement_type, coalesce(sum(amount), 0) as amount, count(*)::int as count
      from miclub.v_movements_enriched
      where operational_status = 'COMPLETADO'
      group by sector_name, movement_type
      order by sector_name, movement_type`),
    pool.query<Record<string, unknown>>(`
      select category, movement_type, coalesce(sum(amount), 0) as amount, count(*)::int as count
      from miclub.v_movements_enriched
      where operational_status = 'COMPLETADO'
      group by category, movement_type
      order by category, movement_type`),
    pool.query<Record<string, unknown>>(`
      select status, count(*)::int as count, coalesce(sum(fee_amount), 0) as fee_amount
      from miclub.enrollments
      group by status
      order by status`),
    pool.query<Record<string, unknown>>(`select * from miclub.operational_balances order by cutoff_date desc, created_at desc limit 1`),
    pool.query<Record<string, unknown>>(`
      select distinct on (metric_key) metric_key, metric_value, source_range, captured_at
      from miclub.sheet_metric_snapshots
      order by metric_key, captured_at desc`),
  ]);

  const row = dashboard.rows[0] ?? {};
  const liquidity = toNumber(row.liquidity);
  const cuotasACobrar = toNumber(row.cuotas_a_cobrar);
  const pendingNetBalance = toNumber(row.pending_net_balance);
  const saldosAPagar = toNumber(row.saldos_a_pagar);
  const expectedProjectedBalance = liquidity + cuotasACobrar + pendingNetBalance - saldosAPagar;
  const calculatedProjectedBalance = toNumber(row.projected_balance);

  const requiredSnapshots = [
    "fitness.total_profitability", "fitness.current_month_profitability", "fitness.settlement_balance",
    "salon.total_profitability", "salon.current_month_profitability", "salon.settlement_balance",
    "aula.total_profitability", "aula.current_month_profitability", "aula.average_commission", "aula.settlement_balance",
    "local1.total_profitability", "local1.current_month_profitability", "local1.settlement_balance",
    "cantina.kiosk_income", "cantina.drinks_income", "cantina.cmv", "cantina.total_profitability",
  ];
  const snapshotKeys = new Set(snapshots.rows.map((item) => String(item.metric_key)));

  return {
    ok: Math.abs(diff(expectedProjectedBalance, calculatedProjectedBalance)) < 0.01 && requiredSnapshots.every((key) => snapshotKeys.has(key)),
    checks: {
      projectedBalance: {
        formula: "Liquidez + Cuotas a cobrar + Saldos pendientes - Saldos a pagar",
        expected: expectedProjectedBalance,
        calculated: calculatedProjectedBalance,
        difference: diff(expectedProjectedBalance, calculatedProjectedBalance),
      },
      missingSheetMetricSnapshots: requiredSnapshots.filter((key) => !snapshotKeys.has(key)).map((metricKey) => ({
        metricKey,
        table: "miclub.sheet_metric_snapshots",
        formula: "Debe importarse desde el rango Google Sheets de referencia o calcularse desde movimientos PostgreSQL.",
      })),
    },
    database: {
      movementTotals: movements.rows,
      completedMovementsBySector: sectors.rows,
      completedMovementsByCategory: categories.rows,
      enrollmentsByStatus: statuses.rows,
      latestOperationalBalance: balances.rows[0] ?? null,
      latestSheetMetricSnapshots: snapshots.rows,
    },
  };
};
