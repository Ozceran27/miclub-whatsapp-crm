import { getPostgresPool } from "../db/postgres.js";

type PgRow = Record<string, unknown>;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const normalized = value.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
};

const toNullableString = (value: unknown): string | null => value == null ? null : String(value);

const normalizeLimit = (value: unknown, defaultLimit = 50, maxLimit = 200): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, maxLimit);
};

export type EconomyClubSummary = {
  source: "postgres";
  totals: {
    income: number;
    expenses: number;
    net: number;
    pendingReceivables: number;
    totalPeople: number;
    activeEnrollments: number;
    debtorEnrollments: number;
  };
  generatedAt: string;
};

export type EconomyClubSectorBalance = {
  sectorId: string | null;
  sectorCode: string | null;
  sectorName: string | null;
  income: number;
  expenses: number;
  balance: number;
};

export type EconomyClubMovement = {
  id: string;
  date: string | null;
  type: string;
  category: string | null;
  sectorCode: string | null;
  sectorName: string | null;
  concept: string;
  counterparty: string | null;
  amount: number;
  taxes: number;
  paymentMethod: string | null;
  financialStatus: string | null;
  operationalStatus: string;
  source: string;
  createdAt: string | null;
};

export const getEconomyClubSummary = async (): Promise<EconomyClubSummary> => {
  const pool = await getPostgresPool();
  const result = await pool.query<PgRow>(`select * from miclub.v_dashboard_basic limit 1`);
  const row = result.rows[0] ?? {};
  const income = toNumber(row.total_income);
  const expenses = toNumber(row.total_expense);

  return {
    source: "postgres",
    totals: {
      income,
      expenses,
      net: income - expenses,
      pendingReceivables: toNumber(row.receivables_total),
      totalPeople: toNumber(row.total_people),
      activeEnrollments: toNumber(row.active_enrollments),
      debtorEnrollments: toNumber(row.debtor_enrollments)
    },
    generatedAt: new Date().toISOString()
  };
};

export const getEconomyClubSectorBalances = async (): Promise<EconomyClubSectorBalance[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<PgRow>(`
    select sector_id, sector_code, sector_name, total_income, total_expense, balance
    from miclub.v_sector_finance_summary
    order by sector_name asc nulls last, sector_code asc nulls last
  `);

  return result.rows.map((row) => ({
    sectorId: toNullableString(row.sector_id),
    sectorCode: toNullableString(row.sector_code),
    sectorName: toNullableString(row.sector_name),
    income: toNumber(row.total_income),
    expenses: toNumber(row.total_expense),
    balance: toNumber(row.balance)
  }));
};

export const listEconomyClubMovements = async (limitInput: unknown): Promise<EconomyClubMovement[]> => {
  const pool = await getPostgresPool();
  const limit = normalizeLimit(limitInput);
  const result = await pool.query<PgRow>(`
    select id, movement_date, movement_type, category, sector_code, sector_name, concept,
      first_name, last_name, counterparty_text, amount, taxes, payment_method,
      financial_status, operational_status, source, created_at
    from miclub.v_movements_enriched
    order by movement_date desc, created_at desc
    limit $1
  `, [limit]);

  return result.rows.map((row) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).map(String).join(" ").trim();
    return {
      id: String(row.id),
      date: toIsoString(row.movement_date),
      type: String(row.movement_type),
      category: toNullableString(row.category),
      sectorCode: toNullableString(row.sector_code),
      sectorName: toNullableString(row.sector_name),
      concept: String(row.concept ?? ""),
      counterparty: fullName || toNullableString(row.counterparty_text),
      amount: toNumber(row.amount),
      taxes: toNumber(row.taxes),
      paymentMethod: toNullableString(row.payment_method),
      financialStatus: toNullableString(row.financial_status),
      operationalStatus: String(row.operational_status),
      source: String(row.source ?? "postgres"),
      createdAt: toIsoString(row.created_at)
    };
  });
};
