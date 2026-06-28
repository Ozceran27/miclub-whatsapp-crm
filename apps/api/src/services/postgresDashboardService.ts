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
const countOccurrences = (value: string, character: string): number =>
  value.split(character).length - 1;

const parseSingleSeparatorNumber = (
  value: string,
  separator: "," | ".",
): string => {
  const separatorIndex = value.indexOf(separator);
  const integerPart = value.slice(0, separatorIndex);
  const fractionalPart = value.slice(separatorIndex + 1);
  if (fractionalPart.length === 3 && /^\d{1,3}$/.test(integerPart)) {
    return `${integerPart}${fractionalPart}`;
  }
  if (fractionalPart.length >= 1 && fractionalPart.length <= 2) {
    return `${integerPart}.${fractionalPart}`;
  }
  return `${integerPart}${fractionalPart}`;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return 0;

    const isNegative = /[-−–—]/.test(raw) || /^\s*\(.*\)\s*$/.test(raw);
    let cleaned = raw
      .replace(/[−–—]/g, "-")
      .replace(/[^\d,.-]/g, "")
      .replace(/-/g, "");
    if (!/\d/.test(cleaned)) return 0;

    const commaCount = countOccurrences(cleaned, ",");
    const dotCount = countOccurrences(cleaned, ".");
    if (commaCount > 0 && dotCount > 0) {
      const lastComma = cleaned.lastIndexOf(",");
      const lastDot = cleaned.lastIndexOf(".");
      cleaned = lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(/,/g, ".")
        : cleaned.replace(/,/g, "");
    } else if (dotCount > 1) cleaned = cleaned.replace(/\./g, "");
    else if (commaCount > 1) cleaned = cleaned.replace(/,/g, "");
    else if (dotCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ".");
    else if (commaCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ",");

    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return 0;
    return isNegative && parsed !== 0 ? -parsed : parsed;
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
const hasValue = (row: Record<string, unknown>, keys: string[]): boolean =>
  keys.some((key) => row[key] !== undefined && row[key] !== null);
const pickNullableNumber = (
  row: Record<string, unknown>,
  keys: string[],
): number | null => hasValue(row, keys) ? pickNumber(row, keys) : null;
const unavailableMetric = (reason = "Pendiente de cálculo en PostgreSQL") => ({
  status: "unavailable" as const,
  reason,
  source: "postgres" as const,
});
export const normalizePostgresSourceSheet = (value: unknown): SourceSheet => {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

const normalizeStatusLabel = (value: unknown, dueDate?: unknown): DebtorStatus => {
  const status = normalizeOperationalStatus(String(value ?? ""));
  if (status === "al_dia") return "Al día";
  if (status === "adeudando") return "Adeudando";
  if (status === "abandonado") return "Abandonado";
  if (status === "cancelado") return "Cancelado";
  if (status === "nuevo_inscripto") {
    const due = dueDate == null ? undefined : new Date(String(dueDate));
    if (due && !Number.isNaN(due.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today ? "Adeudando" : "Al día";
    }
    return "Nuevo Inscripto";
  }
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
      pick(row, ["due_date", "vence", "expiration_date", "expires_at"]),
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
    sourceSheet: normalizePostgresSourceSheet(
      pick(row, ["source_sheet", "sector", "sector_name", "sector_code"]),
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
      settlementSnapshots,
      receivablesFallback,
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
      pool.query<Record<string, unknown>>(
        `select distinct on (metric_key) metric_key, metric_value
         from miclub.sheet_metric_snapshots
         where metric_key = any($1::text[])
         order by metric_key, captured_at desc`,
        [["fitness.settlement_balance", "salon.settlement_balance", "aula.settlement_balance", "local1.settlement_balance"]],
      ),
      pool.query<Record<string, unknown>>(
        `with enrollment_receivables as (
          select
            e.status,
            e.due_date,
            case
              when e.status = 'nuevo_inscripto'::miclub.enrollment_status and e.due_date < current_date then 'adeudando'::miclub.enrollment_status
              when e.status = 'nuevo_inscripto'::miclub.enrollment_status and e.due_date >= current_date then 'al_dia'::miclub.enrollment_status
              else e.status
            end as effective_status,
            e.fee_amount * case
              when upper(coalesce(s.code, s.name, '')) = 'FITNESS' then 0.5
              when upper(coalesce(s.code, s.name, '')) = 'SALON' then 0
              when upper(coalesce(s.code, s.name, '')) = 'AULA' then
                case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end
              else 0
            end as receivable_fee
          from miclub.enrollments e
          join miclub.activities a on a.id = e.activity_id
          join miclub.sectors s on s.id = a.sector_id
        )
        select
          coalesce(sum(receivable_fee) filter (where effective_status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_a_cobrar,
          coalesce(sum(receivable_fee) filter (where effective_status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_adeudadas,
          coalesce(sum(receivable_fee) filter (where effective_status = 'al_dia'::miclub.enrollment_status and due_date between current_date and (date_trunc('month', current_date)::date + interval '1 month - 1 day')::date), 0) as future_receivable_fees_until_month_end
        from enrollment_receivables`,
      ),
    ]);
    const row = {
      ...(dashboard.rows[0] ?? {}),
      ...(operationalBalances.rows[0] ?? {}),
    };
    const sectorBalancesByName = new Map<string, { sector: string; amount: number }>();
    const upsertSectorBalance = (sector: string, amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const key = normalizePostgresSourceSheet(sector);
      sectorBalancesByName.set(key, { sector, amount });
    };
    sectors.rows.forEach((sector) => {
      upsertSectorBalance(
        pickString(sector, ["sector_name", "sector"], "Sin sector"),
        pickNumber(sector, ["settlement_balance", "amount"]),
      );
    });
    settlementSnapshots.rows.forEach((snapshot) => {
      const metricKey = pickString(snapshot, ["metric_key"]);
      const amount = pickNumber(snapshot, ["metric_value"]);
      if (metricKey === "fitness.settlement_balance") {
        upsertSectorBalance("Espacio Fitness", amount);
      } else if (metricKey === "salon.settlement_balance") {
        upsertSectorBalance("Salón", amount);
      } else if (metricKey === "aula.settlement_balance") {
        upsertSectorBalance("Aula", amount);
      } else if (metricKey === "local1.settlement_balance") {
        upsertSectorBalance("Local 1", amount);
      }
    });
    const sectorBalances = Array.from(sectorBalancesByName.values()).sort(
      (a, b) => a.sector.localeCompare(b.sector, "es"),
    );
    const derivedSaldosAPagar = sectorBalances.reduce(
      (sum, sector) => sum + sector.amount,
      0,
    );
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
    const dashboardSaldosAPagar = pickNumber(row, ["saldos_a_pagar"]);
    const effectiveSaldosAPagar = dashboardSaldosAPagar || derivedSaldosAPagar;
    const liquidity = pickNumber(row, [
      "liquidity",
      "cash_balance",
      "available_balance",
    ]);
    const dashboardCuotasACobrar = pickNumber(row, ["cuotas_a_cobrar", "receivable_fees"]);
    const receivablesTotal = pickNumber(row, ["receivables_total"]);
    const cuotasACobrar = dashboardCuotasACobrar || receivablesTotal;
    const pendingNetBalance = pickNumber(row, ["pending_net_balance"]);
    // Regla crítica de equivalencia con ADMINISTRACIÓN:
    // Saldo proyectado = Liquidez + Cuotas a cobrar + Saldos pendientes - Saldos a pagar.
    // Los saldos a pagar son obligaciones y nunca se suman al proyectado.
    const effectiveProjectedBalance = liquidity + cuotasACobrar + pendingNetBalance - effectiveSaldosAPagar;
    return {
      liquidity,
      cash: pickNumber(row, ["cash"]),
      bank: pickNumber(row, ["bank", "bank_balance"]),
      dollars: pickNumber(row, ["dollars", "usd"]),
      pendingIncome: pickNumber(row, ["pending_income"]),
      pendingExpenses: pickNumber(row, ["pending_expenses"]),
      pendingNetBalance,
      cuotasAdeudadas: pickNumber(row, ["cuotas_adeudadas", "overdue_fees"]) || fallbackCuotasACobrar,
      cuotasACobrar,
      futureReceivableFeesUntilMonthEnd: pickNumber(row, [
        "future_receivable_fees_until_month_end",
      ]) || fallbackFutureReceivables,
      saldosAPagar: effectiveSaldosAPagar,
      projectedBalance: effectiveProjectedBalance,
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
    const [sectorResult, local1Result, cantinaResult, snapshotResult, activityResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `select * from miclub.v_sector_finance_summary`,
      ),
      pool.query<Record<string, unknown>>(
        `with relevant as (
          select
            amount,
            coalesce(nullif(trim(concept), ''), category) as concept,
            movement_date
          from miclub.v_movements_enriched
          where regexp_replace(
              translate(lower(coalesce(sector_name, sector_code, '')), 'áéíóúüñ', 'aeiouun'),
              '[^a-z0-9]+',
              '',
              'g'
            ) = 'local1'
            and operational_status = 'COMPLETADO'
            and (
              regexp_replace(
                translate(lower(coalesce(movement_type::text, '')), 'áéíóúüñ', 'aeiouun'),
                '[^a-z0-9]+',
                ' ',
                'g'
              ) = 'ingresos'
              or regexp_replace(
                translate(lower(coalesce(movement_type::text, '')), 'áéíóúüñ', 'aeiouun'),
                '[^a-z0-9]+',
                ' ',
                'g'
              ) like 'ingreso%'
            )
            and regexp_replace(
              translate(lower(coalesce(category, '')), 'áéíóúüñ', 'aeiouun'),
              '[^a-z0-9]+',
              ' ',
              'g'
            ) in ('comision', 'ventas')
        ), highlighted as (
          select amount, concept, movement_date
          from relevant
          order by amount desc, movement_date desc
          limit 1
        )
        select
          (select count(*) from relevant)::integer as total_relevant_income_movements,
          (
            select count(*)
            from relevant
            where movement_date >= now() - interval '30 days'
              and movement_date <= now()
          )::integer as last30days_relevant_income_movements,
          (select amount from highlighted) as highlighted_income_amount,
          (select concept from highlighted) as highlighted_income_concept,
          (select movement_date from highlighted) as highlighted_income_date`,
      ),
      pool.query<Record<string, unknown>>(
        `with normalized_movements as (
          select
            coalesce(amount, 0) as amount,
            regexp_replace(
              translate(lower(coalesce(movement_type::text, '')), 'áéíóúüñ', 'aeiouun'),
              '[^a-z0-9]+',
              '',
              'g'
            ) as normalized_type,
            regexp_replace(
              translate(lower(coalesce(category, '')), 'áéíóúüñ', 'aeiouun'),
              '[^a-z0-9]+',
              '',
              'g'
            ) as normalized_category
          from miclub.v_movements_enriched
          where regexp_replace(
              translate(lower(coalesce(sector_name, sector_code, '')), 'áéíóúüñ', 'aeiouun'),
              '[^a-z0-9]+',
              '',
              'g'
            ) = 'cantina'
        ), cantina_components as (
          select
            coalesce(sum(amount) filter (
              where normalized_type like 'ingreso%'
                and normalized_category in ('kiosco', 'kiosk', 'quiosco')
            ), 0) as kiosk_income,
            coalesce(sum(amount) filter (
              where normalized_type like 'ingreso%'
                and normalized_category in ('bebidas', 'bebida', 'drink', 'drinks')
            ), 0) as drinks_income,
            coalesce(sum(amount) filter (
              where normalized_type like 'egreso%'
                and normalized_category in ('bebidas', 'bebida', 'drink', 'drinks')
            ), 0) as cmv
          from normalized_movements
          where normalized_type in ('ingresos', 'egresos')
        )
        select
          kiosk_income,
          drinks_income,
          cmv,
          kiosk_income + drinks_income - cmv as total_profitability
        from cantina_components`,
      ),
      pool.query<Record<string, unknown>>(
        `select distinct on (metric_key) metric_key, metric_value
         from miclub.sheet_metric_snapshots
         where metric_key = any($1::text[])
         order by metric_key, captured_at desc`,
        [[
          "fitness.total_profitability",
          "fitness.current_month_profitability",
          "fitness.settlement_balance",
          "salon.total_profitability",
          "salon.current_month_profitability",
          "aula.total_profitability",
          "aula.current_month_profitability",
          "aula.average_commission",
          "salon.settlement_balance",
          "aula.settlement_balance",
          "local1.total_profitability",
          "local1.current_month_profitability",
          "local1.settlement_balance",
          "cantina.kiosk_income",
          "cantina.drinks_income",
          "cantina.cmv",
          "cantina.total_profitability",
        ]],
      ),
      pool.query<Record<string, unknown>>(
        `with activity_counts as (
          select
            upper(replace(s.code, ' ', '_')) as sector_key,
            a.name,
            count(*)::integer as members
          from miclub.enrollments e
          join miclub.activities a on a.id = e.activity_id
          join miclub.sectors s on s.id = a.sector_id
          where e.status <> all (array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])
            and upper(replace(s.code, ' ', '_')) in ('SALON', 'AULA')
          group by upper(replace(s.code, ' ', '_')), a.name
        ), ranked as (
          select
            *,
            row_number() over (partition by sector_key order by members desc, name asc) as popularity_rank,
            row_number() over (partition by sector_key order by members asc, name asc) as unpopularity_rank
          from activity_counts
          where name is not null and trim(name) <> ''
        )
        select sector_key, name, members, popularity_rank, unpopularity_rank
        from ranked
        where popularity_rank = 1 or unpopularity_rank = 1`,
      ),
    ]);
    const sectors = sectorResult.rows;
    const snapshots = Object.fromEntries(
      snapshotResult.rows.map((row) => [
        pickString(row, ["metric_key"], ""),
        pickNumber(row, ["metric_value"]),
      ]),
    );
    const sourceCompleteness: Record<string, ReturnType<typeof unavailableMetric>> = {};
    const markUnavailable = (path: string) => {
      sourceCompleteness[path] = unavailableMetric();
    };
    const snapshotMetric = (path: string, snapshotKey: string): number | null => {
      if (Object.prototype.hasOwnProperty.call(snapshots, snapshotKey)) {
        return snapshots[snapshotKey];
      }
      markUnavailable(path);
      return null;
    };
    const queriedMetric = (path: string, row: Record<string, unknown>, keys: string[]): number | null => {
      const value = pickNullableNumber(row, keys);
      if (value === null) markUnavailable(path);
      return value;
    };
    const activityRows = activityResult.rows;
    const activityMetric = (sector: SourceSheet, rankColumn: "popularity_rank" | "unpopularity_rank") => {
      const row = activityRows.find((item) =>
        pickString(item, ["sector_key"]) === sector && pickNumber(item, [rankColumn]) === 1,
      );
      return row ? { name: pickString(row, ["name"]), members: pickNumber(row, ["members"]) } : null;
    };
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
    const fitnessTotalProfitability = snapshotMetric("fitness.totalProfitability", "fitness.total_profitability");
    const fitnessCurrentMonthProfitability = snapshotMetric("fitness.currentMonthProfitability", "fitness.current_month_profitability");
    const fitnessSettlementBalance = snapshotMetric("fitness.settlementBalance", "fitness.settlement_balance");
    const salonTotalProfitability = snapshotMetric("salon.totalProfitability", "salon.total_profitability");
    const salonCurrentMonthProfitability = snapshotMetric("salon.currentMonthProfitability", "salon.current_month_profitability");
    const aulaTotalProfitability = snapshotMetric("aula.totalProfitability", "aula.total_profitability");
    const aulaCurrentMonthProfitability = snapshotMetric("aula.currentMonthProfitability", "aula.current_month_profitability");
    const aulaAverageCommission = snapshotMetric("aula.averageCommission", "aula.average_commission");
    const salonSettlementBalance = snapshotMetric("salon.settlementBalance", "salon.settlement_balance");
    const aulaSettlementBalance = snapshotMetric("aula.settlementBalance", "aula.settlement_balance");
    const local1TotalProfitability = snapshotMetric("local1.totalProfitability", "local1.total_profitability") ?? queriedMetric("local1.totalProfitability", finance("LOCAL_1"), [
      "total_profitability",
      "profitability",
    ]);
    const local1CurrentMonthProfitability = snapshotMetric("local1.currentMonthProfitability", "local1.current_month_profitability") ?? queriedMetric("local1.currentMonthProfitability", finance("LOCAL_1"), [
      "current_month_profitability",
    ]);
    const local1SettlementBalance = snapshotMetric("local1.settlementBalance", "local1.settlement_balance") ?? queriedMetric("local1.settlementBalance", finance("LOCAL_1"), ["settlement_balance"]);
    const preferSnapshotUnlessZero = (snapshot: number | null, fallback: number): number =>
      snapshot == null || (snapshot === 0 && fallback > 0) ? fallback : snapshot;
    const cantinaKioskIncome = preferSnapshotUnlessZero(snapshotMetric("cantina.kioskIncome", "cantina.kiosk_income"), pickNumber(cantinaSpecial, ["kiosk_income"]));
    const cantinaDrinksIncome = preferSnapshotUnlessZero(snapshotMetric("cantina.drinksIncome", "cantina.drinks_income"), pickNumber(cantinaSpecial, ["drinks_income"]));
    const cantinaCmv = preferSnapshotUnlessZero(snapshotMetric("cantina.cmv", "cantina.cmv"), pickNumber(cantinaSpecial, ["cmv"]));
    const fallbackCantinaProfitability = cantinaKioskIncome + cantinaDrinksIncome - cantinaCmv;
    const cantinaTotalProfitability = preferSnapshotUnlessZero(snapshotMetric("cantina.totalProfitability", "cantina.total_profitability"), fallbackCantinaProfitability);
    return {
      metadata: {
        coverage: Object.keys(sourceCompleteness).length > 0 ? "partial" : "complete",
        sourceCompleteness,
        warnings: Object.keys(sourceCompleteness).length > 0 ? ["Algunas métricas PostgreSQL están pendientes de cálculo."] : [],
      },
      fitness: {
        ...base("FITNESS"),
        totalProfitability: fitnessTotalProfitability,
        currentMonthProfitability: fitnessCurrentMonthProfitability,
        totalDebtors: debtors.filter(
          (member) => member.sourceSheet === "FITNESS",
        ).length,
        totalDebtAmount: debtors
          .filter((member) => member.sourceSheet === "FITNESS")
          .reduce((sum, member) => sum + (member.cuota ?? 0), 0),
        settlementBalance: fitnessSettlementBalance,
      },
      salon: {
        ...base("SALON"),
        totalProfitability: salonTotalProfitability,
        currentMonthProfitability: salonCurrentMonthProfitability,
        mostPopularActivity: activityMetric("SALON", "popularity_rank"),
        leastPopularActivity: activityMetric("SALON", "unpopularity_rank"),
        settlementBalance: salonSettlementBalance,
      },
      aula: {
        ...base("AULA"),
        totalProfitability: aulaTotalProfitability,
        currentMonthProfitability: aulaCurrentMonthProfitability,
        averageCommission: aulaAverageCommission,
        mostPopularActivity: activityMetric("AULA", "popularity_rank"),
        settlementBalance: aulaSettlementBalance,
      },
      local1: {
        totalRelevantIncomeMovements: pickNumber(local1Special, [
          "total_relevant_income_movements",
        ]),
        last30DaysRelevantIncomeMovements: pickNumber(local1Special, [
          "last30days_relevant_income_movements",
        ]),
        totalProfitability: local1TotalProfitability,
        currentMonthProfitability: local1CurrentMonthProfitability,
        settlementBalance: local1SettlementBalance,
        highlightedIncome,
      },
      cantina: {
        kioskIncome: cantinaKioskIncome,
        drinksIncome: cantinaDrinksIncome,
        cmv: cantinaCmv,
        totalProfitability: cantinaTotalProfitability,
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
  metadata: { coverage: "unavailable", warnings: ["Resumen financiero PostgreSQL no disponible."], sourceCompleteness: {} },
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
    metadata: { coverage: "unavailable", warnings: ["Resumen sectorial PostgreSQL no disponible."], sourceCompleteness: {} },
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
