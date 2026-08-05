import { getPostgresPool } from "../../db/postgres.js";
import { pendingMovementPredicate } from "../movementPredicates.js";

type AdministrationBalanceRow = {
  cutoff_date: string | null;
  liquidity: string | number | null;
  cash: string | number | null;
  bank: string | number | null;
  dollars: string | number | null;
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

export const getAdministrationReadModel = async (clubId: string): Promise<AdministrationReadModel> => {
  const pool = await getPostgresPool();
  const [balanceResult, pendingResult, recentMovementsResult] = await Promise.all([
    pool.query<AdministrationBalanceRow>(`
      select cutoff_date, liquidity, cash, bank, dollars
      from miclub.operational_balances
      where club_id = $1
      order by cutoff_date desc, created_at desc
      limit 1
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
