import { getPostgresPool } from "../db/postgres.js";

export type EconomyRow = Record<string, unknown>;

const currentMonthRangeSql = `
  select date_trunc('month', now()) as start_at,
         date_trunc('month', now()) + interval '1 month' as end_at
`;

export const getMonthlySummary = async (): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with bounds as (${currentMonthRangeSql})
    select
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as income,
      coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as expenses,
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
      coalesce(sum(case when m.financial_status = 'pendiente' and m.movement_type = 'INGRESOS' then m.amount when m.financial_status = 'pendiente' and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as pending_balance,
      count(*) filter (where m.operational_status = 'COMPLETADO')::integer as completed_movements,
      count(*)::integer as total_movements
    from miclub.movements m
    cross join bounds b
    where m.movement_date >= b.start_at and m.movement_date < b.end_at
  `, []);
  return result.rows;
};

export const getAnnualEvolution = async (year = new Date().getUTCFullYear()): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with months as (
      select generate_series(make_date($1::integer, 1, 1), make_date($1::integer, 12, 1), interval '1 month')::date as month_start
    )
    select
      extract(year from months.month_start)::integer as year,
      extract(month from months.month_start)::integer as month,
      to_char(months.month_start, 'YYYY-MM') as period,
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as income,
      coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as expenses,
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
      count(m.id)::integer as movements
    from months
    left join miclub.movements m on m.movement_date >= months.month_start and m.movement_date < months.month_start + interval '1 month'
    group by months.month_start
    order by months.month_start
  `, [year]);
  return result.rows;
};

const rankingQuery = (dimensionSql: string, idSql: string, tableSql: string) => `
  select ${idSql} as id,
         coalesce(${dimensionSql}, 'Sin clasificar') as name,
         coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as income,
         coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as expenses,
         coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
         count(m.id)::integer as movements
  from miclub.movements m
  ${tableSql}
  where m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
  group by ${idSql}, ${dimensionSql}
  order by balance desc, income desc
  limit $3::integer
`;

export const getRankingBySector = async (from: Date, to: Date, limit: number): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("s.name", "s.id", "left join miclub.sectors s on s.id = m.sector_id"), [from, to, limit])).rows;
};

export const getRankingByCategory = async (from: Date, to: Date, limit: number): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("c.name", "c.id", "left join miclub.movement_categories c on c.id = m.category_id"), [from, to, limit])).rows;
};

export const getPaymentMethods = async (from: Date, to: Date): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select pm.id, coalesce(pm.name, 'Sin método') as name,
           coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as amount,
           count(m.id)::integer as movements
    from miclub.movements m
    left join miclub.payment_methods pm on pm.id = m.payment_method_id
    where m.operational_status = 'COMPLETADO' and m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
    group by pm.id, pm.name
    order by amount desc
  `, [from, to]);
  return result.rows;
};

export const getRecentMovements = async (limit: number): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select * from miclub.v_movements_enriched
    order by movement_date desc nulls last, created_at desc nulls last, id desc nulls last
    limit $1::integer
  `, [limit]);
  return result.rows;
};

export const getPendingMovements = async (limit: number): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select * from miclub.v_movements_enriched
    where financial_status = 'pendiente' or operational_status = 'PENDIENTE'
    order by movement_date asc nulls last, created_at asc nulls last, id asc nulls last
    limit $1::integer
  `, [limit]);
  return result.rows;
};

export const getPendingSummary = async (): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select
      coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
      coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses,
      coalesce(sum(case when movement_type = 'INGRESOS' then amount when movement_type = 'EGRESOS' then -amount else 0 end), 0) as pending_balance,
      count(*)::integer as pending_movements
    from miclub.movements
    where financial_status = 'pendiente' or operational_status = 'PENDIENTE'
  `, []);
  return result.rows;
};

export const getAnnualSummary = async (year = new Date().getUTCFullYear()): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select $1::integer as year,
           coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as income,
           coalesce(sum(case when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as expenses,
           coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then -amount else 0 end), 0) as balance,
           count(*)::integer as movements
    from miclub.movements
    where movement_date >= make_timestamptz($1::integer, 1, 1, 0, 0, 0) and movement_date < make_timestamptz(($1::integer + 1), 1, 1, 0, 0, 0)
  `, [year]);
  return result.rows;
};

export const getBaseInsights = async (): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with current_month as (${currentMonthRangeSql}), previous_month as (
      select start_at - interval '1 month' as start_at, start_at as end_at from current_month
    )
    select 'current_month_balance' as metric, coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as value
    from miclub.movements m, current_month b where m.operational_status = 'COMPLETADO' and m.movement_date >= b.start_at and m.movement_date < b.end_at
    union all
    select 'previous_month_balance' as metric, coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as value
    from miclub.movements m, previous_month b where m.operational_status = 'COMPLETADO' and m.movement_date >= b.start_at and m.movement_date < b.end_at
    union all
    select 'pending_count' as metric, count(*)::numeric as value from miclub.movements where financial_status = 'pendiente' or operational_status = 'PENDIENTE'
  `, []);
  return result.rows;
};
