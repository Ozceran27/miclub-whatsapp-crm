import type {
  ClubOperationsSummary,
  DebtorStatus,
  Member,
  SectorOperationalSummary,
  SourceSheet,
  StatusBreakdown,
} from "@miclub/shared";
import { getPostgresPool } from "../db/postgres.js";
import { normalizeOperationalStatus } from "./googleSheets.js";

const SHEETS: SourceSheet[] = [
  "FITNESS",
  "SALON",
  "AULA",
  "LOCAL_1",
  "CANTINA",
  "ADMINISTRACION",
];
const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const normalized = value
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
const toStringValue = (value: unknown): string | undefined =>
  value == null ? undefined : String(value);
const pick = (row: Record<string, unknown>, keys: string[]): unknown =>
  keys.find((key) => row[key] !== undefined)
    ? row[keys.find((key) => row[key] !== undefined)!]
    : undefined;
const pickString = (
  row: Record<string, unknown>,
  keys: string[],
  fallback = "",
): string => toStringValue(pick(row, keys)) ?? fallback;
const pickNumber = (row: Record<string, unknown>, keys: string[]): number =>
  toNumber(pick(row, keys));
const normalizeSheet = (value: unknown): SourceSheet => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return (SHEETS as string[]).includes(normalized)
    ? (normalized as SourceSheet)
    : "FITNESS";
};

const MOVEMENT_BREAKDOWN_LIMIT = 4;

const getMovementBreakdown = (groupColumn: "sector_name" | "category") => `
  with grouped as (
    select
      coalesce(nullif(trim(${groupColumn}), ''), 'Sin datos') as name,
      coalesce(sum(amount), 0) as amount
    from miclub.v_movements_enriched
    where movement_type = $1
      and operational_status = 'COMPLETADO'
    group by coalesce(nullif(trim(${groupColumn}), ''), 'Sin datos')
  )
  select name, amount, count(*) over () as total_count
  from grouped
  order by amount desc, name asc
  limit ${MOVEMENT_BREAKDOWN_LIMIT}
`;

const normalizeStatusLabel = (value: unknown): DebtorStatus => {
  const status = normalizeOperationalStatus(String(value ?? ""));
  if (status === "al_dia") return "Al día";
  if (status === "nuevo_inscripto") return "Nuevo Inscripto";
  if (status === "adeudando") return "Adeudando";
  if (status === "abandonado") return "Abandonado";
  if (status === "cancelado") return "Cancelado";
  return "Desconocido";
};

export const getPostgresMembers = async (): Promise<Member[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(
    `select * from miclub.v_current_enrollments`,
  );
  return result.rows.map((row, index) => ({
    id: pickString(
      row,
      ["id", "enrollment_id", "person_id", "member_id"],
      `postgres-${index + 1}`,
    ),
    nombre: pickString(row, ["nombre", "first_name", "name"], ""),
    apellido: pickString(row, ["apellido", "last_name"], ""),
    dni: toStringValue(pick(row, ["dni", "document_number", "document"])),
    telefono: pickString(
      row,
      ["telefono", "phone", "phone_number", "whatsapp"],
      "",
    ),
    actividad: toStringValue(
      pick(row, ["actividad", "activity", "activity_name"]),
    ),
    modalidad: toStringValue(
      pick(row, ["modalidad", "modality", "modality_name"]),
    ),
    cuota: pickNumber(row, ["cuota", "fee", "fee_amount", "monthly_fee"]),
    estado: normalizeStatusLabel(
      pick(row, ["estado", "status", "operational_status"]),
    ),
    instructor: toStringValue(pick(row, ["instructor", "instructor_name"])),
    lastPaymentAt: toStringValue(
      pick(row, ["last_payment_at", "last_payment_date", "ultimo_pago_fecha"]),
    ),
    lastPaymentAmount: pickNumber(row, [
      "last_payment_amount",
      "ultimo_pago_monto",
    ]),
    lastPaymentSourceSheet: toStringValue(
      pick(row, ["last_payment_source_sheet"]),
    ),
    lastPaymentConcept: toStringValue(pick(row, ["last_payment_concept"])),
    vence: toStringValue(pick(row, ["vence", "due_day"])),
    expirationDate: toStringValue(pick(row, ["expiration_date", "expires_at"])),
    dueDate: toStringValue(pick(row, ["due_date"])),
    sourceSheet: normalizeSheet(
      pick(row, ["source_sheet", "sector", "sector_name"]),
    ),
  }));
};

const byKey = (
  members: Member[],
  getter: (member: Member) => string,
): Record<string, number> =>
  members.reduce<Record<string, number>>((acc, member) => {
    const key = getter(member) || "Sin datos";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const isActiveEnrollmentStatus = (status: unknown): boolean => {
  const normalizedStatus = normalizeOperationalStatus(status);
  return normalizedStatus !== "abandonado" && normalizedStatus !== "cancelado";
};

const buildStatusBreakdown = (members: Member[]): StatusBreakdown => {
  const statusBreakdown: StatusBreakdown = {
    total: members.length,
    active: 0,
    alDia: 0,
    nuevoInscripto: 0,
    adeudando: 0,
    abandonado: 0,
    cancelado: 0,
    otros: 0,
  };
  for (const member of members) {
    const status = normalizeOperationalStatus(member.estado);
    if (status === "al_dia") statusBreakdown.alDia += 1;
    else if (status === "nuevo_inscripto") statusBreakdown.nuevoInscripto += 1;
    else if (status === "adeudando") statusBreakdown.adeudando += 1;
    else if (status === "abandonado") statusBreakdown.abandonado += 1;
    else if (status === "cancelado") statusBreakdown.cancelado += 1;
    else statusBreakdown.otros += 1;
  }
  statusBreakdown.active = members.filter((member) =>
    isActiveEnrollmentStatus(member.estado),
  ).length;
  return statusBreakdown;
};

export const getPostgresDebtors = async (): Promise<Member[]> =>
  (await getPostgresMembers()).filter(
    (member) => normalizeOperationalStatus(member.estado) === "adeudando",
  );

export const getPostgresSummary = async () => {
  const members = await getPostgresMembers();
  const debtors = members.filter(
    (member) => normalizeOperationalStatus(member.estado) === "adeudando",
  );
  return {
    totalMembers: members.length,
    totalDebtors: debtors.length,
    totalBySheet: byKey(members, (member) => member.sourceSheet),
    debtorsBySheet: byKey(debtors, (member) => member.sourceSheet),
    totalByActivity: byKey(
      members,
      (member) => member.actividad ?? "Sin actividad",
    ),
    debtorsByActivity: byKey(
      debtors,
      (member) => member.actividad ?? "Sin actividad",
    ),
    debtorsWithoutPayments: debtors.filter((member) => !member.lastPaymentAt)
      .length,
    totalEstimatedDebt: debtors.reduce(
      (sum, member) => sum + (member.cuota ?? 0),
      0,
    ),
    statusBreakdown: buildStatusBreakdown(members),
    rawStatusBreakdown: byKey(members, (member) => member.estado),
  };
};

export const getPostgresClubFinanceSummary =
  async (): Promise<ClubOperationsSummary> => {
    const pool = await getPostgresPool();
    const [
      dashboard,
      operationalBalances,
      sectors,
      incomeBySector,
      expenseBySector,
      incomeByCategory,
      expenseByCategory,
    ] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_dashboard_basic`,
      ),
      pool.query<Record<string, unknown>>(
        `select liquidity, cash, bank, dollars from miclub.operational_balances order by cutoff_date desc, created_at desc limit 1`,
      ),
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_sector_settlement_balances where settlement_balance > 0 order by sector_name asc nulls last, sector_id asc nulls last`,
      ),
      pool.query<Record<string, unknown>>(getMovementBreakdown("sector_name"), [
        "INGRESOS",
      ]),
      pool.query<Record<string, unknown>>(getMovementBreakdown("sector_name"), [
        "EGRESOS",
      ]),
      pool.query<Record<string, unknown>>(getMovementBreakdown("category"), [
        "INGRESOS",
      ]),
      pool.query<Record<string, unknown>>(getMovementBreakdown("category"), [
        "EGRESOS",
      ]),
    ]);
    const row = {
      ...(dashboard.rows[0] ?? {}),
      ...(operationalBalances.rows[0] ?? {}),
    };
    const sectorBalances = sectors.rows.map((sector) => ({
      sector: pickString(sector, ["sector_name", "sector"], "Sin sector"),
      amount: pickNumber(sector, ["settlement_balance", "amount"]),
    }));
    const breakdown = (rows: Record<string, unknown>[]) =>
      rows.map((item) => ({
        name: pickString(item, ["name"], "Sin datos"),
        amount: pickNumber(item, ["amount"]),
      }));
    const totalBreakdownItems = (rows: Record<string, unknown>[]) =>
      rows.length > 0 ? pickNumber(rows[0], ["total_count"]) : 0;
    const totalIncomeSectors = totalBreakdownItems(incomeBySector.rows);
    const totalExpenseSectors = totalBreakdownItems(expenseBySector.rows);
    const totalIncomeCategories = totalBreakdownItems(incomeByCategory.rows);
    const totalExpenseCategories = totalBreakdownItems(expenseByCategory.rows);
    const remainingBreakdownItems = (total: number) =>
      Math.max(total - MOVEMENT_BREAKDOWN_LIMIT, 0);
    return {
      liquidity: pickNumber(row, [
        "liquidity",
        "cash_balance",
        "available_balance",
      ]),
      cash: pickNumber(row, ["cash"]),
      bank: pickNumber(row, ["bank", "bank_balance"]),
      dollars: pickNumber(row, ["dollars", "usd"]),
      pendingIncome: pickNumber(row, ["pending_income"]),
      pendingExpenses: pickNumber(row, ["pending_expenses"]),
      pendingNetBalance: pickNumber(row, ["pending_net_balance"]),
      cuotasAdeudadas: pickNumber(row, ["cuotas_adeudadas", "overdue_fees"]),
      cuotasACobrar: pickNumber(row, ["cuotas_a_cobrar", "receivable_fees"]),
      futureReceivableFeesUntilMonthEnd: pickNumber(row, [
        "future_receivable_fees_until_month_end",
      ]),
      saldosAPagar: pickNumber(row, ["saldos_a_pagar"]),
      projectedBalance: pickNumber(row, ["projected_balance"]),
      sectorBalances,
      incomeBySector: breakdown(incomeBySector.rows),
      expenseBySector: breakdown(expenseBySector.rows),
      incomeByCategory: breakdown(incomeByCategory.rows),
      expenseByCategory: breakdown(expenseByCategory.rows),
      totalIncomeSectors,
      remainingIncomeSectors: remainingBreakdownItems(totalIncomeSectors),
      totalExpenseSectors,
      remainingExpenseSectors: remainingBreakdownItems(totalExpenseSectors),
      totalIncomeCategories,
      remainingIncomeCategories: remainingBreakdownItems(totalIncomeCategories),
      totalExpenseCategories,
      remainingExpenseCategories: remainingBreakdownItems(totalExpenseCategories),
    };
  };

export const getPostgresSectorOperationalSummary =
  async (): Promise<SectorOperationalSummary> => {
    const members = await getPostgresMembers();
    const pool = await getPostgresPool();
    const [sectorResult, local1Result, cantinaResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_sector_finance_summary`,
      ),
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_local1_special_metrics`,
      ),
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_cantina_special_metrics`,
      ),
    ]);
    const sectors = sectorResult.rows;
    const sectorRow = (name: string) =>
      sectors.find(
        (row) =>
          String(pick(row, ["sector_name", "sector"]) ?? "")
            .toUpperCase()
            .replace(/\s+/g, "_") === name,
      ) ?? {};
    const membersBySector = (name: SourceSheet) =>
      members.filter((member) => member.sourceSheet === name);
    const base = (name: SourceSheet) => {
      const sectorMembers = membersBySector(name);
      return {
        totalMembers: sectorMembers.length,
        activeMembers: sectorMembers.filter((member) =>
          isActiveEnrollmentStatus(member.estado),
        ).length,
      };
    };
    const finance = (name: string) => sectorRow(name);
    const debtors = members.filter(
      (member) => normalizeOperationalStatus(member.estado) === "adeudando",
    );
    const local1Special = local1Result.rows[0] ?? {};
    const cantinaSpecial = cantinaResult.rows[0] ?? {};
    const highlightedIncome =
      pick(local1Special, ["highlighted_income_amount"]) == null
        ? null
        : {
            amount: pickNumber(local1Special, ["highlighted_income_amount"]),
            concept: pickString(
              local1Special,
              ["highlighted_income_concept"],
              "",
            ),
            date: pickString(local1Special, ["highlighted_income_date"], ""),
          };
    return {
      fitness: {
        ...base("FITNESS"),
        totalProfitability: pickNumber(finance("FITNESS"), [
          "total_profitability",
          "profitability",
        ]),
        currentMonthProfitability: pickNumber(finance("FITNESS"), [
          "current_month_profitability",
        ]),
        totalDebtors: debtors.filter(
          (member) => member.sourceSheet === "FITNESS",
        ).length,
        totalDebtAmount: debtors
          .filter((member) => member.sourceSheet === "FITNESS")
          .reduce((sum, member) => sum + (member.cuota ?? 0), 0),
        settlementBalance: pickNumber(finance("FITNESS"), ["settlement_balance"]),
      },
      salon: {
        ...base("SALON"),
        totalProfitability: pickNumber(finance("SALON"), [
          "total_profitability",
          "profitability",
        ]),
        currentMonthProfitability: pickNumber(finance("SALON"), [
          "current_month_profitability",
        ]),
        mostPopularActivity: null,
        leastPopularActivity: null,
      },
      aula: {
        ...base("AULA"),
        totalProfitability: pickNumber(finance("AULA"), [
          "total_profitability",
          "profitability",
        ]),
        currentMonthProfitability: pickNumber(finance("AULA"), [
          "current_month_profitability",
        ]),
        averageCommission: null,
        mostPopularActivity: null,
      },
      local1: {
        totalRelevantIncomeMovements: pickNumber(local1Special, [
          "total_relevant_income_movements",
        ]),
        last30DaysRelevantIncomeMovements: pickNumber(local1Special, [
          "last30days_relevant_income_movements",
        ]),
        totalProfitability: pickNumber(finance("LOCAL_1"), [
          "total_profitability",
          "profitability",
        ]),
        currentMonthProfitability: pickNumber(finance("LOCAL_1"), [
          "current_month_profitability",
        ]),
        settlementBalance: pickNumber(finance("LOCAL_1"), ["settlement_balance"]),
        highlightedIncome,
      },
      cantina: {
        kioskIncome: pickNumber(cantinaSpecial, ["kiosk_income"]),
        drinksIncome: pickNumber(cantinaSpecial, ["drinks_income"]),
        cmv: pickNumber(cantinaSpecial, ["cmv"]),
        totalProfitability: pickNumber(cantinaSpecial, ["total_profitability"]),
      },
      crm: {
        totalMembers: members.length,
        activeMembers: members.filter((member) =>
          isActiveEnrollmentStatus(member.estado),
        ).length,
        totalDebtors: debtors.length,
        totalDebtAmount: debtors.reduce(
          (sum, member) => sum + (member.cuota ?? 0),
          0,
        ),
      },
    };
  };

export const emptyPostgresSummary = () => ({
  totalMembers: 0,
  totalDebtors: 0,
  totalBySheet: {},
  debtorsBySheet: {},
  totalByActivity: {},
  debtorsByActivity: {},
  debtorsWithoutPayments: 0,
  totalEstimatedDebt: 0,
  statusBreakdown: {
    total: 0,
    active: 0,
    alDia: 0,
    nuevoInscripto: 0,
    adeudando: 0,
    abandonado: 0,
    cancelado: 0,
    otros: 0,
  },
  rawStatusBreakdown: {},
});

export const emptyPostgresClubFinanceSummary = (): ClubOperationsSummary => ({
  liquidity: 0,
  cash: 0,
  bank: 0,
  dollars: 0,
  pendingIncome: 0,
  pendingExpenses: 0,
  pendingNetBalance: 0,
  cuotasAdeudadas: 0,
  cuotasACobrar: 0,
  futureReceivableFeesUntilMonthEnd: 0,
  saldosAPagar: 0,
  projectedBalance: 0,
  sectorBalances: [],
  incomeBySector: [],
  expenseBySector: [],
  incomeByCategory: [],
  expenseByCategory: [],
  totalIncomeSectors: 0,
  remainingIncomeSectors: 0,
  totalExpenseSectors: 0,
  remainingExpenseSectors: 0,
  totalIncomeCategories: 0,
  remainingIncomeCategories: 0,
  totalExpenseCategories: 0,
  remainingExpenseCategories: 0,
});

export const emptyPostgresSectorOperationalSummary =
  (): SectorOperationalSummary => ({
    fitness: {
      totalMembers: 0,
      activeMembers: 0,
      totalProfitability: 0,
      currentMonthProfitability: 0,
      totalDebtors: 0,
      totalDebtAmount: 0,
      settlementBalance: 0,
    },
    salon: {
      totalMembers: 0,
      activeMembers: 0,
      totalProfitability: 0,
      currentMonthProfitability: 0,
      mostPopularActivity: null,
      leastPopularActivity: null,
    },
    aula: {
      totalMembers: 0,
      activeMembers: 0,
      totalProfitability: 0,
      currentMonthProfitability: 0,
      averageCommission: null,
      mostPopularActivity: null,
    },
    local1: {
      totalRelevantIncomeMovements: 0,
      last30DaysRelevantIncomeMovements: 0,
      totalProfitability: 0,
      currentMonthProfitability: 0,
      settlementBalance: 0,
      highlightedIncome: null,
    },
    cantina: { kioskIncome: 0, drinksIncome: 0, cmv: 0, totalProfitability: 0 },
    crm: {
      totalMembers: 0,
      activeMembers: 0,
      totalDebtors: 0,
      totalDebtAmount: 0,
    },
  });
