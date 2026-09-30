import { getPostgresPool } from "../../db/postgres.js";
import { getArgentinaCalendarYear } from "../../domain/argentinaTime.js";
import type { EconomyRow } from "./types.js";
import { completeAmount, missingRateCount, valuedMovementsCte } from "./valuedMovements.js";

const income = "operational_status = 'COMPLETADO' and movement_type = 'INGRESOS'";
const expenses = "operational_status = 'COMPLETADO' and movement_type = 'EGRESOS'";
const ordinary = "operational_status = 'COMPLETADO' and movement_type in ('INGRESOS', 'EGRESOS')";
const operating = `${ordinary} and category_classification = 'OPERATIONAL'
  and not exists (select 1 from miclub.payout_groups payout
    where payout.club_id = m.club_id and payout.id = m.payout_group_id and payout.direction = 'COLLECT')`;
const signed = (filter: string) => `case when ${missingRateCount(filter)} > 0 then null
  else coalesce(sum(case when ${filter} and movement_type = 'INGRESOS' then valued_amount
    when ${filter} and movement_type = 'EGRESOS' then -valued_amount else 0 end), 0) end`;

export const getMonthlySummary = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(3)}
    select ${completeAmount(income)} income,
      ${completeAmount(expenses)} expenses,
      ${signed(ordinary)} balance,
      ${signed("operational_status = 'PENDIENTE' and movement_type in ('INGRESOS', 'EGRESOS')")} pending_balance,
      ${missingRateCount(ordinary)} missing_rate_count,
      ${missingRateCount("operational_status = 'PENDIENTE' and movement_type in ('INGRESOS', 'EGRESOS')")} pending_missing_rate_count,
      max(presentation_currency_code) currency_code,
      count(*) filter (where ${ordinary})::integer completed_movements,
      count(m.id)::integer total_movements
    from valued_movements m
    where movement_date >= $1 and movement_date < $2
  `, [from, to, clubId])).rows;
};

export const getAnnualEvolution = async (clubId: string, year = getArgentinaCalendarYear(), _operatingCategories: readonly string[] = []): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(2)}, club_calendar as (
      select coalesce(nullif(trim(timezone), ''), 'America/Argentina/Buenos_Aires') timezone
      from miclub.clubs where id = $2
    ), months as (
      select generate_series(make_date($1::integer - 1, 12, 1),
        make_date($1::integer, 12, 1), interval '1 month')::date month_start
    ), monthly as (
      select months.month_start,
        ${completeAmount(income)} income,
        ${completeAmount(expenses)} expenses,
        ${signed(ordinary)} balance,
        ${signed(operating)} operating_profitability,
        ${missingRateCount(ordinary)} missing_rate_count,
        count(m.id) filter (where m.operational_status = 'COMPLETADO')::integer movements
      from months cross join club_calendar cc
      left join valued_movements m on m.movement_date >= (months.month_start::timestamp at time zone cc.timezone)
        and m.movement_date < ((months.month_start + interval '1 month')::timestamp at time zone cc.timezone)
      group by months.month_start
    ), annual as (
      select monthly.*,
        coalesce((select count(e.id)::integer from miclub.enrollments e
          join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
          join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
          where e.club_id = $2 and e.enrollment_date < (monthly.month_start + interval '1 month')::date
            and (e.end_date is null or e.end_date >= (monthly.month_start + interval '1 month')::date)
            and e.superseded_at is null), 0) cumulative_enrollments
      from monthly
    ), evolved as (
      select annual.*, lag(income) over (order by month_start) previous_growth_income,
        lag(cumulative_enrollments) over (order by month_start) previous_cumulative_enrollments
      from annual
    )
    select extract(year from month_start)::integer as year,
      extract(month from month_start)::integer as month, to_char(month_start, 'YYYY-MM') as period,
      income, expenses, balance, operating_profitability, missing_rate_count, movements,
      cumulative_enrollments, income growth_income, previous_growth_income,
      previous_cumulative_enrollments
    from evolved where month_start >= make_date($1::integer, 1, 1)
    order by month_start
  `, [year, clubId])).rows;
};

export const getAnnualSummary = async (clubId: string, year = getArgentinaCalendarYear()): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(2)}, club_calendar as (
      select coalesce(nullif(trim(timezone), ''), 'America/Argentina/Buenos_Aires') timezone
      from miclub.clubs where id = $2
    )
    select $1::integer as year, ${completeAmount(income)} income,
      ${completeAmount(expenses)} expenses, ${signed(ordinary)} balance,
      ${missingRateCount(ordinary)} missing_rate_count,
      count(*) filter (where ${ordinary})::integer movements,
      max(presentation_currency_code) currency_code
    from valued_movements m cross join club_calendar cc
    where m.movement_date >= make_timestamptz($1::integer, 1, 1, 0, 0, 0, cc.timezone)
      and m.movement_date < make_timestamptz($1::integer + 1, 1, 1, 0, 0, 0, cc.timezone)
  `, [year, clubId])).rows;
};

export const getCompletedMonthMovementSummary = async (previousStart: Date, currentStart: Date, currentEnd: Date, _operatingCategories: readonly string[], clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(4)}, periods as (
      select 'previous'::text period_key, $1::timestamptz start_at, $2::timestamptz end_at
      union all select 'current', $2::timestamptz, $3::timestamptz
    )
    select p.period_key, ${completeAmount(income)} income,
      ${completeAmount(expenses)} expenses,
      ${signed(ordinary)} utility,
      ${signed(operating)} operating_profitability,
      ${missingRateCount(ordinary)} missing_rate_count
    from periods p left join valued_movements m
      on m.movement_date >= p.start_at and m.movement_date < p.end_at
    group by p.period_key
    order by case p.period_key when 'previous' then 1 else 2 end
  `, [previousStart, currentStart, currentEnd, clubId])).rows;
};

export const getGrowthSummary = async (previousStart: Date, currentStart: Date, currentEnd: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(4)}, periods as (
      select 'previous'::text period_key, $1::timestamptz start_at, $2::timestamptz end_at
      union all select 'current', $2::timestamptz, $3::timestamptz
    ), club_calendar as (
      select coalesce(nullif(trim(timezone), ''), 'America/Argentina/Buenos_Aires') timezone
      from miclub.clubs where id = $4
    )
    select p.period_key,
      (select ${completeAmount(income)} from valued_movements m
        where m.movement_date >= p.start_at and m.movement_date < p.end_at) income,
      coalesce((select count(e.id)::integer from miclub.enrollments e
        join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
        join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
        where e.club_id = $4 and e.enrollment_date < (p.end_at at time zone cc.timezone)::date
          and (e.end_date is null or e.end_date >= (p.end_at at time zone cc.timezone)::date)
          and e.superseded_at is null), 0) enrollments
    from periods p cross join club_calendar cc
    order by case p.period_key when 'previous' then 1 else 2 end
  `, [previousStart, currentStart, currentEnd, clubId])).rows;
};

export const getYearlyBreakdownRows = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(3)}
    select extract(year from movement_day)::integer as year,
      extract(month from movement_day)::integer as month,
      category_code, category_classification classification,
      max(category_name) category_label, movement_type,
      ${completeAmount(ordinary)} amount,
      ${missingRateCount(ordinary)} missing_rate_count,
      count(*)::integer movements
    from valued_movements m
    where movement_date >= $1 and movement_date < $2 and ${ordinary}
    group by 1, 2, 3, 4, 6
    order by 1, 2, 3, 6
  `, [from, to, clubId])).rows;
};

export const getAvailableYears = async (clubId: string): Promise<number[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ year: number }>(`
    select distinct extract(year from (m.movement_date at time zone
      coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires')))::integer as year
    from miclub.movements m join miclub.clubs c on c.id = m.club_id
    where m.club_id = $1
    order by year desc
  `, [clubId]);
  return result.rows.map(row => Number(row.year));
};

export const getClubCurrencyCode = async (clubId: string): Promise<string> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ base_currency_code: string }>(
    'select base_currency_code from miclub.clubs where id = $1', [clubId],
  );
  if (!result.rows[0]) throw new Error('Club no disponible');
  return result.rows[0].base_currency_code;
};
