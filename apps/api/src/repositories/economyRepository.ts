import { getPostgresPool } from "../db/postgres.js";
import { getArgentinaCalendarYear } from "../domain/argentinaTime.js";
import { DEBT_LIABILITY_CATEGORY_KEYS, NON_OPERATING_EXPENSE_CATEGORY_KEYS, OPERATING_CATEGORIES, SERVICE_CATEGORY_KEYS, TAX_CATEGORY_KEYS } from "../services/economyDomain.js";
import { completedMovementPredicate, pendingMovementPredicate } from "./movementPredicates.js";

export type EconomyRow = Record<string, unknown>;

export const getClubFinanceSummary = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    select * from miclub.v_dashboard_basic where club_id = $1
  `, [clubId])).rows;
};


export const getMonthlySummary = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with bounds as (select $1::timestamptz as start_at, $2::timestamptz as end_at)
    select
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as income,
      coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as expenses,
      coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
      coalesce(sum(case when ${pendingMovementPredicate("m")} and m.source_payload->>'sheet' = 'ADMINISTRACIÓN' and m.movement_type = 'INGRESOS' then m.amount when ${pendingMovementPredicate("m")} and m.source_payload->>'sheet' = 'ADMINISTRACIÓN' and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as pending_balance,
      count(*) filter (where m.operational_status = 'COMPLETADO')::integer as completed_movements,
      count(*) filter (where ${completedMovementPredicate("m")})::integer as total_movements
    from miclub.movements m
    left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
    cross join bounds b
    where coalesce(upper(regexp_replace(translate(trim(c.name), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g')), '') <> 'CAPITAL'
      and m.movement_date >= b.start_at and m.movement_date < b.end_at
      and m.club_id = $3
  `, [from, to, clubId]);
  return result.rows;
};

export const getAnnualEvolution = async (clubId: string, year = getArgentinaCalendarYear(), operatingCategories: readonly string[] = []): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with months as (
      select generate_series(make_date(($1::integer - 1), 12, 1), make_date($1::integer, 12, 1), interval '1 month')::date as month_start
    ), monthly as (
      select
        months.month_start,
        coalesce(sum(m.amount) filter (where m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO'), 0) as income,
        coalesce(sum(m.amount) filter (where m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO'), 0) as expenses,
        coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
        coalesce(sum(m.amount) filter (where m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' and normalized_category <> 'CAPITAL'), 0) as growth_income,
        coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' and normalized_category = any($2::text[]) then abs(m.amount) when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' and normalized_category = any($2::text[]) then -abs(m.amount) else 0 end), 0) as operating_profitability,
        count(m.id) filter (where m.operational_status = 'COMPLETADO')::integer as movements
      from months
      left join (
        select m.*, upper(regexp_replace(regexp_replace(translate(trim(coalesce(c.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) as normalized_category
        from miclub.movements m
        left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
        where m.club_id = $3
      ) m on m.movement_date >= (months.month_start at time zone 'America/Argentina/Buenos_Aires') and m.movement_date < ((months.month_start + interval '1 month') at time zone 'America/Argentina/Buenos_Aires')
      group by months.month_start
    )
    select
      extract(year from monthly.month_start)::integer as year,
      extract(month from monthly.month_start)::integer as month,
      to_char(monthly.month_start, 'YYYY-MM') as period,
      monthly.income,
      monthly.expenses,
      monthly.balance,
      monthly.operating_profitability,
      monthly.movements,
      coalesce((
        select count(e.id)::integer
        from miclub.enrollments e
        join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
        join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
        where e.enrollment_date < ((monthly.month_start + interval '1 month') at time zone 'America/Argentina/Buenos_Aires')::date
          and e.club_id = $3
          and coalesce(e.inactive, false) = false
          and e.superseded_at is null
          and upper(regexp_replace(translate(trim(s.name), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', '_', 'g')) in ('FITNESS', 'SALON', 'AULA')
      ), 0) as cumulative_enrollments,
      lag(monthly.growth_income) over (order by monthly.month_start) as previous_growth_income,
      lag(coalesce((
        select count(e.id)::integer
        from miclub.enrollments e
        join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
        join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
        where e.enrollment_date < ((monthly.month_start + interval '1 month') at time zone 'America/Argentina/Buenos_Aires')::date
          and e.club_id = $3
          and coalesce(e.inactive, false) = false
          and e.superseded_at is null
          and upper(regexp_replace(translate(trim(s.name), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', '_', 'g')) in ('FITNESS', 'SALON', 'AULA')
      ), 0)) over (order by monthly.month_start) as previous_cumulative_enrollments,
      monthly.growth_income
    from monthly
    where monthly.month_start >= make_date($1::integer, 1, 1)
    order by monthly.month_start
  `, [year, operatingCategories, clubId]);
  return result.rows;
};

const rankingQuery = (dimensionSql: string, idSql: string, tableSql: string) => `
  select ${idSql} as id,
         coalesce(${dimensionSql}, 'Sin clasificar') as name,
         coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'INGRESOS'), 0) as income,
         coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'EGRESOS'), 0) as expenses,
         coalesce(sum(case when m.movement_type = 'INGRESOS' then abs(m.amount) when m.movement_type = 'EGRESOS' then -abs(m.amount) else 0 end), 0) as balance,
         count(m.id)::integer as movements
  from miclub.movements m
  ${tableSql}
  left join miclub.movement_categories ranking_category on ranking_category.id = m.category_id and ranking_category.club_id = m.club_id
  where m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
    and m.club_id = $5
    and ${completedMovementPredicate("m")}
    and upper(regexp_replace(regexp_replace(translate(trim(coalesce(ranking_category.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) = any($4::text[])
    and m.movement_type in ('INGRESOS', 'EGRESOS')
  group by ${idSql}, ${dimensionSql}
  order by balance desc, income desc
  limit $3::integer
`;

export const getRankingBySector = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("s.name", "s.id", "left join miclub.sectors s on s.id = m.sector_id and s.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getRankingByCategory = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("c.name", "c.id", "left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getPaymentMethods = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select pm.id, coalesce(pm.name, 'Sin método') as name,
           coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'INGRESOS'), 0) as amount,
           count(m.id) filter (where m.movement_type = 'INGRESOS')::integer as movements
    from miclub.movements m
    left join miclub.payment_methods pm on pm.id = m.payment_method_id and pm.club_id = m.club_id
    where m.operational_status = 'COMPLETADO'
      and m.movement_type = 'INGRESOS'
      and m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
      and m.club_id = $3
    group by pm.id, pm.name
    order by amount desc
  `, [from, to, clubId]);
  return result.rows;
};

export const getEconomyAuxiliarySummary = async (monthFrom: Date, yearFrom: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with periods as (
      select 'monthly'::text as period_key, $1::timestamptz as start_at, $3::timestamptz as end_at
      union all
      select 'annual'::text, $2::timestamptz, $3::timestamptz
    ), movements as (
      select p.period_key, m.movement_type, abs(m.amount) as amount,
        upper(regexp_replace(regexp_replace(translate(trim(coalesce(c.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) as normalized_category
      from periods p
      left join miclub.movements m on m.movement_date >= p.start_at and m.movement_date < p.end_at
        and m.club_id = $8
        and m.operational_status = 'COMPLETADO'
        and m.movement_type in ('INGRESOS', 'EGRESOS')
      left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
    )
    select period_key,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category = any($4::text[]) then amount when movement_type = 'EGRESOS' and normalized_category = any($4::text[]) then -amount else 0 end), 0) as non_operating_balance,
      count(*) filter (where movement_type in ('INGRESOS', 'EGRESOS') and normalized_category = any($4::text[]))::integer as non_operating_movements,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category = any($5::text[]) then amount when movement_type = 'EGRESOS' and normalized_category = any($5::text[]) then -amount else 0 end), 0) as debt_liability_balance,
      count(*) filter (where movement_type in ('INGRESOS', 'EGRESOS') and normalized_category = any($5::text[]))::integer as debt_liability_movements,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category = any($6::text[]) then amount when movement_type = 'EGRESOS' and normalized_category = any($6::text[]) then -amount else 0 end), 0) as services_balance,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category = any($7::text[]) then amount when movement_type = 'EGRESOS' and normalized_category = any($7::text[]) then -amount else 0 end), 0) as taxes_balance
    from movements
    group by period_key
  `, [monthFrom, yearFrom, to, NON_OPERATING_EXPENSE_CATEGORY_KEYS, DEBT_LIABILITY_CATEGORY_KEYS, SERVICE_CATEGORY_KEYS, TAX_CATEGORY_KEYS, clubId]);
  return result.rows;
};

export const getMovementStatusCounts = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  // Explicit exception: this diagnostic intentionally includes every status.
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select upper(regexp_replace(regexp_replace(translate(trim(coalesce(operational_status::text, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\s+', ' ', 'g'), '\.+$', '', 'g')) as status,
      count(*)::integer as movements
    from miclub.movements
    where movement_date >= $1::timestamptz and movement_date < $2::timestamptz
      and club_id = $3
    group by status
  `, [from, to, clubId]);
  return result.rows;
};

export const getRecentMovements = async (limit: number, clubId: string): Promise<EconomyRow[]> => {
  // Explicit exception: the recent activity feed exposes every status.
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select * from miclub.v_movements_enriched
    where club_id = $2
    order by movement_date desc nulls last, created_at desc nulls last, id desc nulls last
    limit $1::integer
  `, [limit, clubId]);
  return result.rows;
};

export const getPendingMovements = async (limit: number, clubId: string): Promise<EconomyRow[]> => {
  // Explicit exception: a pending list is not an ordinary completed metric.
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select * from miclub.v_movements_enriched
    where club_id = $2
      and ${pendingMovementPredicate("v_movements_enriched")}
    order by movement_date asc nulls last, created_at asc nulls last, id asc nulls last
    limit $1::integer
  `, [limit, clubId]);
  return result.rows;
};

export const getPendingSummary = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select
      coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
      coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses,
      coalesce(sum(case when movement_type = 'INGRESOS' then amount when movement_type = 'EGRESOS' then -amount else 0 end), 0) as pending_balance,
      count(*)::integer as pending_movements
    from miclub.movements
    where club_id = $1
      and ${pendingMovementPredicate("movements")}
      and source_payload->>'sheet' = 'ADMINISTRACIÓN'
  `, [clubId]);
  return result.rows;
};

export const getAnnualSummary = async (clubId: string, year = getArgentinaCalendarYear()): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select $1::integer as year,
           coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as income,
           coalesce(sum(case when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as expenses,
           coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then -amount else 0 end), 0) as balance,
           count(*) filter (where ${completedMovementPredicate("movements")})::integer as movements
    from miclub.movements
    where movement_date >= make_timestamptz($1::integer, 1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires') and movement_date < make_timestamptz(($1::integer + 1), 1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires')
      and club_id = $2
  `, [year, clubId]);
  return result.rows;
};


export const getCompletedMonthMovementSummary = async (previousStart: Date, currentStart: Date, currentEnd: Date, operatingCategories: readonly string[], clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with periods as (
      select 'previous' as period_key, $1::timestamptz as start_at, $2::timestamptz as end_at
      union all
      select 'current' as period_key, $2::timestamptz as start_at, $3::timestamptz as end_at
    ), movements as (
      select p.period_key, m.movement_type, m.amount, upper(regexp_replace(regexp_replace(translate(trim(coalesce(c.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) as normalized_category
      from periods p
      left join miclub.movements m on m.movement_date >= p.start_at and m.movement_date < p.end_at
        and m.club_id = $5
        and m.operational_status = 'COMPLETADO'
        and m.movement_type in ('INGRESOS', 'EGRESOS')
      left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
    )
    select period_key,
      coalesce(sum(amount) filter (where movement_type = 'INGRESOS' and normalized_category <> 'CAPITAL'), 0) as income,
      coalesce(sum(amount) filter (where movement_type = 'EGRESOS' and normalized_category <> 'CAPITAL'), 0) as expenses,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category <> 'CAPITAL' then amount when movement_type = 'EGRESOS' and normalized_category <> 'CAPITAL' then -amount else 0 end), 0) as utility,
      coalesce(sum(case when movement_type = 'INGRESOS' and normalized_category = any($4::text[]) then abs(amount) when movement_type = 'EGRESOS' and normalized_category = any($4::text[]) then -abs(amount) else 0 end), 0) as operating_profitability
    from movements
    group by period_key
    order by case period_key when 'previous' then 1 else 2 end
  `, [previousStart, currentStart, currentEnd, operatingCategories, clubId]);
  return result.rows;
};

export const getGrowthSummary = async (previousStart: Date, currentStart: Date, currentEnd: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with periods as (
      select 'previous'::text as period_key, $1::timestamptz as start_at, $2::timestamptz as end_at
      union all
      select 'current'::text, $2::timestamptz, $3::timestamptz
    )
    select p.period_key,
      coalesce((
        select sum(m.amount)
        from miclub.movements m
        left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
        where m.movement_date >= p.start_at and m.movement_date < p.end_at
          and m.club_id = $4
          and m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO'
          and upper(regexp_replace(regexp_replace(translate(trim(coalesce(c.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) <> 'CAPITAL'
      ), 0) as income,
      coalesce((
        select count(e.id)::integer
        from miclub.enrollments e
        join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
        join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
        where e.enrollment_date < (p.end_at at time zone 'America/Argentina/Buenos_Aires')::date
          and e.club_id = $4
          and coalesce(e.inactive, false) = false
          and e.superseded_at is null
          and upper(regexp_replace(translate(trim(s.name), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', '_', 'g')) in ('FITNESS', 'SALON', 'AULA')
      ), 0) as enrollments
    from periods p
    order by case p.period_key when 'previous' then 1 else 2 end
  `, [previousStart, currentStart, currentEnd, clubId]);
  return result.rows;
};

export const getEconomyDataQuality = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select
      count(*) filter (where operational_status = 'COMPLETADO' and sector_id is null)::integer as missing_sector,
      count(*) filter (where operational_status = 'COMPLETADO' and category_id is null)::integer as missing_category,
      count(*) filter (where operational_status = 'COMPLETADO' and payment_method_id is null)::integer as missing_payment_method
    from miclub.movements
    where club_id = $1
  `, [clubId]);
  return result.rows;
};

export const getBaseInsights = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select 'pending_count' as metric, count(*)::numeric as value
    from miclub.movements
    where club_id = $1 and ${pendingMovementPredicate("movements")}
  `, [clubId]);
  return result.rows;
};

export const getCurrentPreviousMonthComparison = async (_clubId: string): Promise<EconomyRow[]> => [];

export const getYearlyBreakdownRows = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select
      extract(year from (m.movement_date at time zone 'America/Argentina/Buenos_Aires'))::integer as year,
      extract(month from (m.movement_date at time zone 'America/Argentina/Buenos_Aires'))::integer as month,
      upper(regexp_replace(regexp_replace(translate(trim(coalesce(c.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) as normalized_category,
      coalesce(nullif(trim(c.name), ''), 'Sin clasificar') as category_label,
      m.movement_type,
      coalesce(sum(m.amount), 0) as amount,
      count(m.id)::integer as movements
    from miclub.movements m
    left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id
    where m.movement_date >= $1::timestamptz
      and m.movement_date < $2::timestamptz
      and m.club_id = $3
      and m.operational_status = 'COMPLETADO'
      and m.movement_type in ('INGRESOS', 'EGRESOS')
    group by 1, 2, 3, 4, 5
    order by 1, 2, 3, 5
  `, [from, to, clubId]);
  return result.rows;
};
