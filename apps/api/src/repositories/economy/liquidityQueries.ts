import { getPostgresPool } from "../../db/postgres.js";
import { pendingMovementPredicate } from "../movementPredicates.js";
import type { EconomyRow } from "./types.js";
import { completeAmount, missingRateCount, valuedMovementsCte } from "./valuedMovements.js";

const signedCategory = (classification: string) => {
  const filter = `category_classification = '${classification}' and operational_status = 'COMPLETADO'
    and movement_type in ('INGRESOS', 'EGRESOS')`;
  return `case when ${missingRateCount(filter)} > 0 then null else
    coalesce(sum(case when ${filter} and movement_type = 'INGRESOS' then valued_amount
      when ${filter} and movement_type = 'EGRESOS' then -valued_amount else 0 end), 0) end`;
};

export const getClubFinanceSummary = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(`
    with ledger_balance as (
      select v.*, usd->>'rate' as applied_rate, usd->>'rateDate' as rate_date,
        usd->>'source' as rate_source, usd->>'direction' as rate_direction
      from miclub.value_club_liquidity($1,current_date) v
      left join lateral (select x as usd from jsonb_array_elements(v.account_valuations) x
        where x->>'currencyCode'='USD' limit 1) q on true
    )
    select d.*,
      b.liquidity,
      b.cash,
      b.bank,
      coalesce(b.dollars, 0) as dollars,
      b.dollars_converted,
      b.presentation_currency_code, b.applied_rate, b.rate_date, b.rate_source,b.rate_direction,
      b.valuation_status,b.unvalued_account_count,b.missing_pairs,b.account_valuations,
      case when b.valuation_status='COMPLETE' then b.liquidity
        + coalesce(d.cuotas_a_cobrar, 0)
        - coalesce(d.saldos_a_pagar, 0)
        + coalesce(d.pending_net_balance, 0) end as projected_balance
    from miclub.v_dashboard_basic d
    left join ledger_balance b on true
    where d.club_id = $1
  `, [clubId])).rows;
};


export const getEconomyAuxiliarySummary = async (monthFrom: Date, yearFrom: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(4)}, periods as (
      select 'monthly'::text as period_key, $1::timestamptz as start_at, $3::timestamptz as end_at
      union all
      select 'annual'::text, $2::timestamptz, $3::timestamptz
    )
    select p.period_key,
      ${signedCategory('NON_OPERATIONAL')} non_operating_balance,
      count(m.id) filter (where category_classification = 'NON_OPERATIONAL' and operational_status = 'COMPLETADO')::integer non_operating_movements,
      ${signedCategory('LIABILITY')} debt_liability_balance,
      count(m.id) filter (where category_classification = 'LIABILITY' and operational_status = 'COMPLETADO')::integer debt_liability_movements,
      ${signedCategory('SERVICE')} services_balance,
      ${signedCategory('TAX')} taxes_balance,
      ${missingRateCount("operational_status = 'COMPLETADO' and movement_type in ('INGRESOS', 'EGRESOS')")} missing_rate_count
    from periods p left join valued_movements m
      on m.movement_date >= p.start_at and m.movement_date < p.end_at
    group by p.period_key
  `, [monthFrom, yearFrom, to, clubId]);
  return result.rows;
};

export const getMovementStatusCounts = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  // Explicit exception: this diagnostic intentionally includes every status.
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select upper(regexp_replace(regexp_replace(translate(trim(coalesce(operational_status::text, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) as status,
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
    select v.id, v.external_id, v.movement_date, v.movement_type, v.category_id, v.category,
           v.sector_id, v.sector_code, v.sector_name, v.concept, v.person_id, v.first_name,
           v.last_name, v.counterparty_text, v.amount, v.taxes, v.payment_method_id,
           v.payment_method, v.financial_status, v.operational_status, v.source, raw.currency_code
    from miclub.v_movements_enriched v
    join miclub.movements raw on raw.id = v.id and raw.club_id = v.club_id
    where v.club_id = $2
    order by v.movement_date desc nulls last, v.created_at desc nulls last, v.id desc nulls last
    limit $1::integer
  `, [limit, clubId]);
  return result.rows;
};

export const getPendingMovements = async (limit: number, clubId: string): Promise<EconomyRow[]> => {
  // Explicit exception: a pending list is not an ordinary completed metric.
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select v.id, v.external_id, v.movement_date, v.movement_type, v.category_id, v.category,
           v.sector_id, v.sector_code, v.sector_name, v.concept, v.person_id, v.first_name,
           v.last_name, v.counterparty_text, v.amount, v.taxes, v.payment_method_id,
           v.payment_method, v.financial_status, v.operational_status, v.source, raw.currency_code
    from miclub.v_movements_enriched v
    join miclub.movements raw on raw.id = v.id and raw.club_id = v.club_id
    where v.club_id = $2
      and ${pendingMovementPredicate("v")}
    order by v.movement_date asc nulls last, v.created_at asc nulls last, v.id asc nulls last
    limit $1::integer
  `, [limit, clubId]);
  return result.rows;
};

export const getPendingSummary = async (clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    with ${valuedMovementsCte(1)}
    select ${completeAmount("operational_status = 'PENDIENTE' and movement_type = 'INGRESOS'")} pending_income,
      ${completeAmount("operational_status = 'PENDIENTE' and movement_type = 'EGRESOS'")} pending_expenses,
      case when ${missingRateCount("operational_status = 'PENDIENTE' and movement_type in ('INGRESOS', 'EGRESOS')")} > 0 then null
        else coalesce(sum(case when movement_type = 'INGRESOS' then valued_amount
          when movement_type = 'EGRESOS' then -valued_amount else 0 end)
          filter (where operational_status = 'PENDIENTE'), 0) end pending_balance,
      ${missingRateCount("operational_status = 'PENDIENTE' and movement_type in ('INGRESOS', 'EGRESOS')")} missing_rate_count,
      max(presentation_currency_code) currency_code,
      count(*) filter (where operational_status = 'PENDIENTE' and movement_type in ('INGRESOS', 'EGRESOS'))::integer pending_movements
    from valued_movements
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

export const getCurrentPreviousMonthComparison = (_clubId: string): Promise<EconomyRow[]> => Promise.resolve([]);
