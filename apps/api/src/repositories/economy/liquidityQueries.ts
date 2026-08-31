import { getPostgresPool } from "../../db/postgres.js";
import { getArgentinaCalendarYear } from "../../domain/argentinaTime.js";
import { DEBT_LIABILITY_CATEGORY_KEYS, NON_OPERATING_EXPENSE_CATEGORY_KEYS, OPERATING_CATEGORIES, SERVICE_CATEGORY_KEYS, TAX_CATEGORY_KEYS } from "../../services/economyDomain.js";
import { completedMovementPredicate, pendingMovementPredicate } from "../movementPredicates.js";
import type { EconomyRow } from "./types.js";

export const getClubFinanceSummary = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with valued_accounts as (
      select a.*, c.base_currency_code,
        case when a.currency_code = c.base_currency_code then a.balance
             when r.base_currency_code = a.currency_code then a.balance * r.rate
             else a.balance / r.rate end as presented_balance,
        r.id as exchange_rate_id, r.rate, r.rate_date, r.source
      from miclub.v_financial_account_liquidity a join miclub.clubs c on c.id=a.club_id
      left join lateral (select er.* from miclub.exchange_rates er
        where ((er.base_currency_code=a.currency_code and er.quote_currency_code=c.base_currency_code)
          or (er.base_currency_code=c.base_currency_code and er.quote_currency_code=a.currency_code))
          and er.rate_type='official' and er.rate_date <= current_date
        order by er.rate_date desc limit 1) r on a.currency_code <> c.base_currency_code
    ), ledger_balance as (
      select coalesce(sum(presented_balance), 0) as liquidity,
        coalesce(sum(balance) filter (where code='CASH'), 0) as cash,
        coalesce(sum(balance) filter (where code='BANK'), 0) as bank,
        coalesce(sum(balance) filter (where currency_code='USD'), 0) as dollars,
        coalesce(sum(presented_balance) filter (where currency_code='USD'), 0) as dollars_converted,
        max(base_currency_code) as presentation_currency_code,
        max(rate) filter (where currency_code='USD') as applied_rate,
        max(rate_date) filter (where currency_code='USD') as rate_date,
        max(source) filter (where currency_code='USD') as rate_source
      from valued_accounts
      where club_id = $1
    )
    select d.*,
      coalesce(b.liquidity, 0) as liquidity,
      coalesce(b.cash, 0) as cash,
      coalesce(b.bank, 0) as bank,
      coalesce(b.dollars, 0) as dollars,
      coalesce(b.dollars_converted, 0) as dollars_converted,
      b.presentation_currency_code, b.applied_rate, b.rate_date, b.rate_source,
      coalesce(b.liquidity, 0)
        + coalesce(d.cuotas_a_cobrar, 0)
        - coalesce(d.saldos_a_pagar, 0)
        + coalesce(d.pending_net_balance, 0) as projected_balance
    from miclub.v_dashboard_basic d
    left join ledger_balance b on true
    where d.club_id = $1
  `, [clubId])).rows;
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
    select id, external_id, movement_date, movement_type, category_id, category,
           sector_id, sector_code, sector_name, concept, person_id, first_name,
           last_name, counterparty_text, amount, taxes, payment_method_id,
           payment_method, financial_status, operational_status, source
    from miclub.v_movements_enriched
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
    select id, external_id, movement_date, movement_type, category_id, category,
           sector_id, sector_code, sector_name, concept, person_id, first_name,
           last_name, counterparty_text, amount, taxes, payment_method_id,
           payment_method, financial_status, operational_status, source
    from miclub.v_movements_enriched
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
