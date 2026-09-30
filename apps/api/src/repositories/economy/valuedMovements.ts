/**
 * Tenant-scoped ledger relation shared by Treasury aggregates. Amounts are
 * valued in the club's base currency at the movement's local date. A missing
 * official quote stays NULL so an aggregate cannot silently become partial.
 */
const quote = (from: string, to: string) => `
  select case when er.base_currency_code = ${from} then er.rate
              else 1 / er.rate end as factor
  from miclub.exchange_rates er
  where er.rate_type = 'official'
    and er.rate_date between local_day.movement_day - 4 and local_day.movement_day
    and ((er.base_currency_code = ${from} and er.quote_currency_code = ${to})
      or (er.base_currency_code = ${to} and er.quote_currency_code = ${from}))
  order by er.rate_date desc,
    case when er.base_currency_code = ${from} then 0 else 1 end,
    er.fetched_at desc, er.id
  limit 1
`;

export const valuedMovementsCte = (clubParameter: number): string => {
  if (!Number.isInteger(clubParameter) || clubParameter < 1) throw new Error('Invalid club parameter');
  return `valued_movements as (
    select m.*, category.name as category_name, catalog.code as category_code,
      catalog.classification as category_classification,
      club.base_currency_code as presentation_currency_code,
      local_day.movement_day,
      case when coalesce(m.currency_code, club.base_currency_code) = club.base_currency_code then m.amount
        when direct_quote.factor is not null then m.amount * direct_quote.factor
        when source_pivot.factor is not null and pivot_target.factor is not null
          then m.amount * source_pivot.factor * pivot_target.factor
        else null end as valued_amount
    from miclub.movements m
    join miclub.clubs club on club.id = m.club_id
    left join miclub.movement_categories category on category.id = m.category_id and category.club_id = m.club_id
    left join miclub.category_catalog catalog on catalog.id = category.catalog_id
    cross join lateral (
      select (m.movement_date at time zone coalesce(nullif(trim(club.timezone), ''),
        'America/Argentina/Buenos_Aires'))::date as movement_day
    ) local_day
    left join lateral (${quote('m.currency_code', 'club.base_currency_code')}) direct_quote
      on m.currency_code is distinct from club.base_currency_code
    left join lateral (${quote('m.currency_code', "'USD'")}) source_pivot
      on m.currency_code is distinct from club.base_currency_code
      and m.currency_code <> 'USD' and club.base_currency_code <> 'USD'
      and direct_quote.factor is null
    left join lateral (${quote("'USD'", 'club.base_currency_code')}) pivot_target
      on source_pivot.factor is not null and direct_quote.factor is null
    where m.club_id = $${clubParameter}
  )`;
};

export const completeAmount = (filter: string): string =>
  `case when count(*) filter (where ${filter} and valued_amount is null) > 0
    then null else coalesce(sum(valued_amount) filter (where ${filter}), 0) end`;

export const missingRateCount = (filter: string): string =>
  `count(*) filter (where ${filter} and valued_amount is null)::integer`;

