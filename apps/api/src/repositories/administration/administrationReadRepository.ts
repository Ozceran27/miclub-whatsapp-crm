import { getPostgresPool } from "../../db/postgres.js";
import { pendingMovementPredicate } from "../movementPredicates.js";

type AdministrationBalanceRow = {
  cutoff_date: string | null;
  liquidity: string | number | null;
  cash: string | number | null;
  bank: string | number | null;
  dollars: string | number | null;
  dollars_converted: string | number | null;
  presentation_currency_code: string | null;
  applied_rate: string | number | null;
  rate_date: string | null;
  rate_source: string | null;
};

type AdministrationPendingRow = {
  pending_income: string | number | null;
  pending_expenses: string | number | null;
  pending_balance: string | number | null;
  pending_movements: number | null;
};

type AdministrationRecentMovementRow = {
  id: string;
  movement_date: string | null;
  movement_type: string | null;
  category: string | null;
  sector_name: string | null;
  concept: string | null;
  amount: string | number | null;
  payment_method: string | null;
  operational_status: string | null;
};

export type AdministrationReadModel = {
  balance: {
    cutoffDate: string | null;
    liquidity: number;
    cash: number;
    bank: number;
    dollars: number;
    dollarsConverted: number;
    presentationCurrencyCode: string;
    appliedRate: number | null;
    rateDate: string | null;
    rateSource: string | null;
  };
  pending: {
    income: number;
    expenses: number;
    balance: number;
    movements: number;
  };
  recentMovements: Array<{
    id: string;
    date: string | null;
    type: string | null;
    category: string | null;
    sector: string | null;
    concept: string | null;
    amount: number;
    paymentMethod: string | null;
    status: string | null;
  }>;
};

const toNumber = (value: string | number | null | undefined): number => Number(value ?? 0);

export type AdministrationSectorCapacityRow = { sector_id:string; name:string; capacity_mode:"ENROLLMENTS"|"INCOME"; maximum_capacity:string|number|null; current_usage:string|number|null; utilization_percentage:string|number|null; idle_percentage:string|number|null; data_status:"AVAILABLE"|"NO_DATA"|"NOT_CONFIGURED" };
/** Tenant-scoped entry point for all capacity consumers; formulas live in the canonical DB view. */
export const getAdministrationSectorCapacities = async (clubId:string):Promise<AdministrationSectorCapacityRow[]> => {
  const pool=await getPostgresPool();
  return (await pool.query<AdministrationSectorCapacityRow>(`select c.sector_id,s.name,c.capacity_mode,c.maximum_capacity,c.current_usage,c.utilization_percentage,c.idle_percentage,c.data_status from miclub.v_sector_capacity_metrics c join miclub.sectors s on s.club_id=c.club_id and s.id=c.sector_id where c.club_id=$1 and s.archived_at is null order by s.name,s.id`,[clubId])).rows;
};

export const getAdministrationReadModel = async (clubId: string): Promise<AdministrationReadModel> => {
  const pool = await getPostgresPool();
  const [balanceResult, pendingResult, recentMovementsResult] = await Promise.all([
    pool.query<AdministrationBalanceRow>(`
      with valued as (select a.*, c.base_currency_code,
        case when a.currency_code=c.base_currency_code then balance when r.base_currency_code=a.currency_code then balance*r.rate else balance/r.rate end presented_balance,
        r.rate,r.rate_date,r.source from miclub.v_financial_account_liquidity a join miclub.clubs c on c.id=a.club_id
        left join lateral (select er.* from miclub.exchange_rates er where er.rate_date<=current_date and er.rate_type='official'
          and ((er.base_currency_code=a.currency_code and er.quote_currency_code=c.base_currency_code) or (er.base_currency_code=c.base_currency_code and er.quote_currency_code=a.currency_code)) order by er.rate_date desc limit 1) r on a.currency_code<>c.base_currency_code)
      select current_date::text as cutoff_date,
        coalesce(sum(presented_balance), 0) as liquidity,
        coalesce(sum(balance) filter (where code='CASH'), 0) as cash,
        coalesce(sum(balance) filter (where code='BANK'), 0) as bank,
        coalesce(sum(balance) filter (where currency_code='USD'), 0) as dollars,
        coalesce(sum(presented_balance) filter (where currency_code='USD'), 0) as dollars_converted,
        max(base_currency_code) presentation_currency_code,max(rate) filter(where currency_code='USD') applied_rate,
        max(rate_date) filter(where currency_code='USD') rate_date,max(source) filter(where currency_code='USD') rate_source
      from valued
      where club_id = $1
    `, [clubId]),
    pool.query<AdministrationPendingRow>(`
      select
        coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
        coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses,
        coalesce(sum(case when movement_type = 'INGRESOS' then amount when movement_type = 'EGRESOS' then -amount else 0 end), 0) as pending_balance,
        count(*)::integer as pending_movements
      from miclub.movements
      where club_id = $1
        and ${pendingMovementPredicate("movements")}
        and source_payload->>'sheet' = 'ADMINISTRACIÓN'
    `, [clubId]),
    pool.query<AdministrationRecentMovementRow>(`
      select id, movement_date, movement_type, category, sector_name, concept, amount, payment_method, operational_status
      from miclub.v_movements_enriched
      where club_id = $1
        and source_payload->>'sheet' = 'ADMINISTRACIÓN'
      order by movement_date desc nulls last, id desc
      limit 10
    `, [clubId]),
  ]);

  const balance = balanceResult.rows[0];
  const pending = pendingResult.rows[0];

  return {
    balance: {
      cutoffDate: balance?.cutoff_date ?? null,
      liquidity: toNumber(balance?.liquidity),
      cash: toNumber(balance?.cash),
      bank: toNumber(balance?.bank),
      dollars: toNumber(balance?.dollars),
      dollarsConverted: toNumber(balance?.dollars_converted),
      presentationCurrencyCode: balance?.presentation_currency_code ?? "ARS",
      appliedRate: balance?.applied_rate == null ? null : toNumber(balance.applied_rate),
      rateDate: balance?.rate_date ?? null,
      rateSource: balance?.rate_source ?? null,
    },
    pending: {
      income: toNumber(pending?.pending_income),
      expenses: toNumber(pending?.pending_expenses),
      balance: toNumber(pending?.pending_balance),
      movements: Number(pending?.pending_movements ?? 0),
    },
    recentMovements: recentMovementsResult.rows.map((movement) => ({
      id: movement.id,
      date: movement.movement_date,
      type: movement.movement_type,
      category: movement.category,
      sector: movement.sector_name,
      concept: movement.concept,
      amount: toNumber(movement.amount),
      paymentMethod: movement.payment_method,
      status: movement.operational_status,
    })),
  };
};
