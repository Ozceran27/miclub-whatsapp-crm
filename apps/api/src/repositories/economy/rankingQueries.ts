import { getPostgresPool } from "../../db/postgres.js";
import { OPERATING_CATEGORIES } from "../../services/economyDomain.js";
import { completedMovementPredicate } from "../movementPredicates.js";
import type { EconomyRow } from "./types.js";

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

const normalizedCategorySql = "upper(regexp_replace(regexp_replace(translate(trim(coalesce(ranking_category.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g'))";

const getClubTimezone = async (clubId: string): Promise<string> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ timezone: string | null }>(
    "select nullif(trim(timezone), '') as timezone from miclub.clubs where id = $1",
    [clubId],
  );
  return result.rows[0]?.timezone ?? DEFAULT_TIMEZONE;
};

export const getClubCalendarNow = async (clubId: string, reference = new Date()): Promise<{ year: number; month: number; timezone: string }> => {
  const timezone = await getClubTimezone(clubId);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(reference);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), timezone };
};


export const getClubMonthWindow = async (clubId: string, year: number, month: number): Promise<{ from: Date; to: Date; timezone: string }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ from: Date; to: Date; timezone: string }>(`
    with club_context as (
      select coalesce(nullif(trim(timezone), ''), $4::text) as timezone
      from miclub.clubs
      where id = $1
    )
    select
      make_timestamptz($2::integer, $3::integer, 1, 0, 0, 0, timezone) as from,
      (make_date($2::integer, $3::integer, 1) + interval '1 month')::timestamp at time zone timezone as to,
      timezone
    from club_context
  `, [clubId, year, month, DEFAULT_TIMEZONE]);
  const row = result.rows[0];
  return { from: row?.from ?? new Date(), to: row?.to ?? new Date(), timezone: row?.timezone ?? DEFAULT_TIMEZONE };
};

export const getClubYearToDateWindow = async (clubId: string, year: number, reference = new Date()): Promise<{ from: Date; to: Date; timezone: string }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ from: Date; to: Date; timezone: string }>(`
    with club_context as (
      select coalesce(nullif(trim(timezone), ''), $4::text) as timezone
      from miclub.clubs
      where id = $1
    )
    select
      make_timestamptz($2::integer, 1, 1, 0, 0, 0, timezone) as from,
      $3::timestamptz as to,
      timezone
    from club_context
  `, [clubId, year, reference, DEFAULT_TIMEZONE]);
  const row = result.rows[0];
  return { from: row?.from ?? reference, to: row?.to ?? reference, timezone: row?.timezone ?? DEFAULT_TIMEZONE };
};

const rankingQuery = (dimensionSql: string, idSql: string, tableSql: string, extraWhere = "") => `
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
    and ${normalizedCategorySql} = any($4::text[])
    and m.movement_type in ('INGRESOS', 'EGRESOS')
    ${extraWhere}
  group by ${idSql}, ${dimensionSql}
  order by balance desc, income desc
  limit $3::integer
`;

export const getRankingBySector = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("s.name", "s.id", "left join miclub.sectors s on s.id = m.sector_id and s.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getRankingByActivity = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("a.name", "a.id", "left join miclub.activities a on a.id = m.activity_id and a.club_id = m.club_id", "and m.activity_id is not null"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getRankingByCategory = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("c.name", "c.id", "left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

const trendsQuery = (dimensionSql: string, idSql: string, tableSql: string, extraWhere = "") => `
  with club_context as (
    select coalesce(nullif(trim(timezone), ''), $4::text) as timezone
    from miclub.clubs
    where id = $3
  ), months as (
    select generate_series(
      make_date($1::integer, 1, 1),
      make_date($1::integer, 12, 1),
      interval '1 month'
    )::date as month_start
  ), ranked as (
    select
      extract(month from months.month_start)::integer as month,
      to_char(months.month_start, 'YYYY-MM') as period,
      ${idSql} as id,
      coalesce(${dimensionSql}, 'Sin clasificar') as name,
      coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'INGRESOS'), 0) as income,
      coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'EGRESOS'), 0) as expenses,
      coalesce(sum(case when m.movement_type = 'INGRESOS' then abs(m.amount) when m.movement_type = 'EGRESOS' then -abs(m.amount) else 0 end), 0) as balance,
      count(m.id)::integer as movements
    from months
    cross join club_context cc
    left join miclub.movements m on m.movement_date >= (months.month_start::timestamp at time zone cc.timezone)
      and m.movement_date < ((months.month_start + interval '1 month')::timestamp at time zone cc.timezone)
      and m.club_id = $3
      and ${completedMovementPredicate("m")}
      and m.movement_type in ('INGRESOS', 'EGRESOS')
    ${tableSql}
    left join miclub.movement_categories ranking_category on ranking_category.id = m.category_id and ranking_category.club_id = m.club_id
    where m.id is not null
      and ${normalizedCategorySql} = any($5::text[])
      ${extraWhere}
    group by months.month_start, ${idSql}, ${dimensionSql}
  )
  select *
  from (
    select ranked.*, row_number() over (partition by month order by balance desc, income desc) as rank
    from ranked
  ) monthly_ranked
  where rank <= $2::integer
  order by month, rank
`;

export const getSectorTrends = async (year: number, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(trendsQuery("s.name", "s.id", "left join miclub.sectors s on s.id = m.sector_id and s.club_id = m.club_id"), [year, limit, clubId, DEFAULT_TIMEZONE, OPERATING_CATEGORIES])).rows;
};

export const getActivityTrends = async (year: number, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(trendsQuery("a.name", "a.id", "left join miclub.activities a on a.id = m.activity_id and a.club_id = m.club_id", "and m.activity_id is not null"), [year, limit, clubId, DEFAULT_TIMEZONE, OPERATING_CATEGORIES])).rows;
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
