import {
  getAnnualEvolution,
  getAnnualSummary as getAnnualSummaryRows,
  getBaseInsights,
  getEconomyDataQuality,
  getGrowthSummary,
  getMonthlySummary,
  getPaymentMethods as getPaymentMethodRows,
  getEconomyAuxiliarySummary,
  getMovementStatusCounts,
  getPendingMovements as getPendingMovementRows,
  getPendingSummary as getPendingSummaryRows,
  getActivityTrends as getActivityTrendRows,
  getClubCalendarNow,
  getClubMonthWindow,
  getClubYearToDateWindow,
  getRankingByActivity,
  getRankingByCategory,
  getRankingBySector,
  getSectorTrends as getSectorTrendRows,
  getRecentMovements as getRecentMovementRows,
  getCompletedMonthMovementSummary,
  getYearlyBreakdownRows,
  getAvailableYears as getAvailableYearRows,
  getClubCurrencyCode,
  type EconomyRow,
} from "../repositories/economyRepository.js";
import { readFinancialCircuit, type FinanceScope } from "./financialCircuitService.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";
import { ARGENTINA_TIME_ZONE, calculateVariation, classifyExpenseCategory, DEBT_LIABILITY_CATEGORIES, EXPENSE_TYPE_KEYS, EXPENSE_TYPE_LABELS, getRollingInterannualMonthWindow, NON_OPERATING_EXPENSE_CATEGORIES, normalizeCategoryName, OPERATING_CATEGORIES, SERVICE_CATEGORIES, TAX_CATEGORIES, type ExpenseTypeKey } from "./economyDomain.js";
import { getArgentinaCalendarYear } from "../domain/argentinaTime.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const normalizeRows = (rows: EconomyRow[]): JsonRecord[] => rows.map((row) => normalizeRow(row));
type EconomyCollection = { items: JsonRecord[]; total: number; [key: string]: unknown };

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toInteger = (value: unknown): number => Math.trunc(toNumber(value));
const toText = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
const nullableNumber = (value: unknown): number | null => value === null || value === undefined ? null : toNumber(value);
const valuation = (missing: unknown) => ({ valuationStatus: toInteger(missing) > 0 ? 'INCOMPLETE_EXCHANGE_RATE' : 'COMPLETE', missingRateCount: toInteger(missing) });

const parseLimit = (value: unknown, fallback = DEFAULT_LIMIT): number => {
  const parsed = toInteger(Array.isArray(value) ? value[0] : value);
  if (parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
};

const parseYear = (value: unknown): number => {
  const parsed = toInteger(Array.isArray(value) ? value[0] : value);
  return parsed >= 2000 && parsed <= 2100 ? parsed : getArgentinaCalendarYear();
};

const legacyVariation = (current: number, previous: number): number | null => calculateVariation(current, previous).percentageChange;


export const normalizeRankingItems = (rows: EconomyRow[] | JsonRecord[]): JsonRecord[] => normalizeRows(rows as EconomyRow[]).map((item) => {
  const income = nullableNumber(item.income);
  const expenses = nullableNumber(item.expenses);
  const balance = item.balance === undefined ? income === null || expenses === null ? null : income - expenses : nullableNumber(item.balance);
  return {
    ...item,
    id: item.id ?? null,
    name: toText(item.name, "Sin clasificar"),
    income,
    expenses,
    balance,
    movements: toInteger(item.movements),
    ...valuation(item.missingRateCount),
  };
}).sort((a, b) => toNumber(b.balance) - toNumber(a.balance) || toNumber(b.income) - toNumber(a.income));

const addVariation = (items: JsonRecord[]): JsonRecord[] =>
  items.map((item, index) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    const income = nullableNumber(item.income);
    const expenses = nullableNumber(item.expenses);
    const balance = nullableNumber(item.balance);
    return {
      ...item,
      incomeVariation: previous && income !== null && previous.income !== null ? legacyVariation(income, toNumber(previous.income)) : null,
      expensesVariation: previous && expenses !== null && previous.expenses !== null ? legacyVariation(expenses, toNumber(previous.expenses)) : null,
      balanceVariation: previous && balance !== null && previous.balance !== null ? legacyVariation(balance, toNumber(previous.balance)) : null,
    };
  });

export const getSummary = async (auth: FinanceScope): Promise<JsonRecord> => {
  const clubId = auth.clubId;
  const calendar = await getClubCalendarNow(clubId);
  const month = await getClubMonthWindow(clubId, calendar.year, calendar.month);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { timeZone: calendar.timezone, month: 'long' }).format(month.from);
  const [summary, finance] = await Promise.all([
    getMonthlySummary(month.from, month.to, clubId).then(normalizeRows),
    readFinancialCircuit(auth),
  ]);
  const projection = finance.projection;
  const row = summary[0] ?? {};
  const income = nullableNumber(row.income);
  const expenses = nullableNumber(row.expenses);
  return {
    month: { label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), income, expenses, balance: nullableNumber(row.balance) },
    current: { liquidity: projection.liquidity, projectedBalance: projection.projectedBalance },
    income,
    expenses,
    balance: nullableNumber(row.balance),
    liquidity: projection.liquidity,
    projectedBalance: projection.projectedBalance,
    pendingBalance: nullableNumber(row.pendingBalance),
    currencyCode: projection.currencyCode,
    period: `${calendar.year}-${String(calendar.month).padStart(2, '0')}`,
    ...valuation(toInteger(row.missingRateCount) + toInteger(row.pendingMissingRateCount)),
    projectionComplete: projection.complete,
    projectionAssumptions: projection.assumptions,
    completedMovements: toInteger(row.completedMovements),
    totalMovements: toInteger(row.totalMovements),
  };
};

export const getMonthlyEvolution = async (clubId: string, yearQuery?: unknown): Promise<EconomyCollection> => {
  const year = yearQuery === undefined ? (await getClubCalendarNow(clubId)).year : parseYear(yearQuery);
  const [rows, currencyCode] = await Promise.all([getAnnualEvolution(clubId, year, OPERATING_CATEGORIES), getClubCurrencyCode(clubId)]);
  const baseItems = addVariation(normalizeRows(rows));
  const items = baseItems.map((item) => {
    const economicGrowth = item.growthIncome === null || item.previousGrowthIncome === null ? null : calculateVariation(toNumber(item.growthIncome), toNumber(item.previousGrowthIncome));
    const clientGrowth = calculateVariation(toNumber(item.cumulativeEnrollments), toNumber(item.previousCumulativeEnrollments));
    const comparable = economicGrowth?.percentageChange !== null && economicGrowth !== null && clientGrowth.percentageChange !== null;
    return {
      ...item,
      utility: nullableNumber(item.balance),
      operatingProfitability: nullableNumber(item.operatingProfitability),
      growth: comparable ? ((economicGrowth?.percentageChange ?? 0) + (clientGrowth.percentageChange ?? 0)) / 2 : null,
      economicGrowth: economicGrowth?.percentageChange ?? null,
      clientGrowth: clientGrowth.percentageChange,
      growthComparable: comparable,
      ...valuation(item.missingRateCount),
    };
  });
  const missingRateCount = items.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0);
  return { items, total: items.length, year, currencyCode, ...valuation(missingRateCount) };
};

export const getAvailableYears = async (clubId: string): Promise<{ items: number[]; total: number }> => {
  const [years, calendar] = await Promise.all([getAvailableYearRows(clubId), getClubCalendarNow(clubId)]);
  const items = Array.from(new Set([calendar.year, ...years])).sort((a, b) => b - a);
  return { items, total: items.length };
};



type YearlyBreakdownAggregateRow = {
  year?: unknown;
  month?: unknown;
  normalizedCategory?: unknown;
  normalized_category?: unknown;
  categoryCode?: unknown;
  category_code?: unknown;
  classification?: unknown;
  categoryLabel?: unknown;
  category_label?: unknown;
  movementType?: unknown;
  movement_type?: unknown;
  amount?: unknown;
  movements?: unknown;
};

const expenseValueForMovement = (group: ExpenseTypeKey, movementType: string, amount: number): number => {
  if (group === 'OPERATING' || group === 'NON_OPERATING') return movementType === 'EGRESOS' ? amount : 0;
  // Convención de gastos: egresos - ingresos. El signo se preserva para reintegros o reducciones netas.
  if (group === 'DEBT' || group === 'SERVICES' || group === 'TAXES') return movementType === 'EGRESOS' ? amount : movementType === 'INGRESOS' ? -amount : 0;
  return 0;
};

export const buildYearlyBreakdown = (window: ReturnType<typeof getRollingInterannualMonthWindow>, rows: YearlyBreakdownAggregateRow[]): JsonRecord => {
  const monthIndexByKey = new Map(window.months.map((month, index) => [month.key, index]));
  const incomeByCategory = new Map<string, { key: string; label: string; annualTotal: number; values: number[] }>();
  const expenses = new Map<string, { key: string; label: string; values: number[] }>();
  for (const key of EXPENSE_TYPE_KEYS) expenses.set(key, { key, label: EXPENSE_TYPE_LABELS[key], values: Array(window.months.length).fill(0) });
  const unclassified = new Map<string, number>();
  let consideredMovements = 0;

  for (const raw of rows) {
    const year = toInteger(raw.year);
    const month = toInteger(raw.month);
    const monthIndex = monthIndexByKey.get(`${year}-${String(month).padStart(2, '0')}`);
    if (monthIndex === undefined) continue;
    const category = normalizeCategoryName(raw.categoryCode ?? raw.category_code ?? raw.normalizedCategory ?? raw.normalized_category);
    const classification = normalizeCategoryName(raw.classification) || ({ OPERATING: 'OPERATIONAL', NON_OPERATING: 'NON_OPERATIONAL', TAXES: 'TAX', SERVICES: 'SERVICE', DEBT: 'LIABILITY' } as const)[classifyExpenseCategory(category) as Exclude<ExpenseTypeKey, 'UNCLASSIFIED'>] || '';
    const categoryLabel = toText(raw.categoryLabel ?? raw.category_label, category);
    const movementType = normalizeCategoryName(raw.movementType ?? raw.movement_type);
    const amount = toNumber(raw.amount);
    const movements = toInteger(raw.movements);
    consideredMovements += movements;

    if (movementType === 'INGRESOS' && classification === 'OPERATIONAL') {
      const series = incomeByCategory.get(category) ?? { key: category, label: categoryLabel, annualTotal: 0, values: Array(window.months.length).fill(0) };
      series.values[monthIndex] += amount;
      series.annualTotal += amount;
      incomeByCategory.set(category, series);
    }

    const group = classifyExpenseCategory({ classification });
    if (group === 'UNCLASSIFIED') {
      if (movementType === 'EGRESOS') unclassified.set(category || 'SIN CLASIFICAR', (unclassified.get(category || 'SIN CLASIFICAR') ?? 0) + movements);
      continue;
    }
    const expenseSeries = expenses.get(group);
    if (expenseSeries) expenseSeries.values[monthIndex] += expenseValueForMovement(group, movementType, amount);
  }

  const roundValues = (values: number[]) => values.map((value) => Math.round(value * 100) / 100);
  const operatingIncomeByCategory = Array.from(incomeByCategory.values())
    .map((series) => ({ ...series, annualTotal: Math.round(series.annualTotal * 100) / 100, values: roundValues(series.values) }))
    .filter((series) => series.annualTotal > 0)
    .sort((a, b) => b.annualTotal - a.annualTotal || a.label.localeCompare(b.label, 'es-AR'));

  return {
    period: {
      from: window.fromMonth,
      toExclusive: window.toExclusive,
      fromMonth: window.months[0]?.key,
      toMonth: window.months[window.months.length - 1]?.key,
      timezone: window.timezone,
      monthCount: window.months.length,
    },
    months: window.months.map((month) => ({ key: month.key, label: month.label, fullLabel: month.fullLabel, year: month.year, month: month.month })),
    operatingIncomeByCategory,
    expensesByType: Array.from(expenses.values()).map((series) => ({ ...series, values: roundValues(series.values) })),
    metadata: {
      unclassifiedExpenseCount: Array.from(unclassified.values()).reduce((sum, count) => sum + count, 0),
      unclassifiedExpenseCategories: Array.from(unclassified.entries()).map(([category, count]) => ({ category, count })),
      generatedAt: new Date().toISOString(),
      timezone: window.timezone,
      signConvention: 'EXPENSES_MINUS_INCOME_FOR_DEBT_SERVICES_TAXES',
      consideredMovements,
    },
  };
};

const parseAsOfDate = (value: unknown): Date => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T12:00:00-03:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof raw === 'string' && /^\d{4}$/.test(raw)) {
    const now = new Date();
    const monthParts = new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TIME_ZONE, month: '2-digit' })
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    const parsed = new Date(`${raw}-${monthParts.month}-15T12:00:00-03:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export const getYearlyBreakdown = async (clubId: string, asOfQuery?: unknown): Promise<JsonRecord> => {
  const calendar = await getClubCalendarNow(clubId, parseAsOfDate(asOfQuery));
  const monthReference = new Date(Date.UTC(calendar.year, calendar.month - 1, 15, 12));
  const interannual = getRollingInterannualMonthWindow(monthReference);
  const [firstMonth, lastMonth] = await Promise.all([
    getClubMonthWindow(clubId, interannual.months[0].year, interannual.months[0].month),
    getClubMonthWindow(clubId, calendar.year, calendar.month),
  ]);
  const window = { ...interannual, start: firstMonth.from, end: lastMonth.to, timezone: calendar.timezone };
  const [breakdownRows, currencyCode] = await Promise.all([getYearlyBreakdownRows(window.start, window.end, clubId), getClubCurrencyCode(clubId)]);
  const rows = normalizeRows(breakdownRows);
  const missingRateCount = rows.reduce((sum, row) => sum + toInteger(row.missingRateCount), 0);
  const result = buildYearlyBreakdown(window, missingRateCount ? [] : rows);
  return { ...result, currencyCode, metadata: { ...(result.metadata as JsonRecord), ...valuation(missingRateCount) } };
};

export const getBySector = async (clubId: string, limitQuery?: unknown): Promise<EconomyCollection> => {
  const calendar = await getClubCalendarNow(clubId);
  const { from, to } = await getClubMonthWindow(clubId, calendar.year, calendar.month);
  const [rows, currencyCode] = await Promise.all([getRankingBySector(from, to, parseLimit(limitQuery), clubId), getClubCurrencyCode(clubId)]);
  const items = normalizeRankingItems(rows);
  return { items, total: items.length, currencyCode, period: `${calendar.year}-${String(calendar.month).padStart(2, '0')}`, ...valuation(items.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0)) };
};

export const getByCategory = async (clubId: string, limitQuery?: unknown): Promise<EconomyCollection> => {
  const calendar = await getClubCalendarNow(clubId);
  const { from, to } = await getClubMonthWindow(clubId, calendar.year, calendar.month);
  const [rows, currencyCode] = await Promise.all([getRankingByCategory(from, to, parseLimit(limitQuery), clubId), getClubCurrencyCode(clubId)]);
  const items = normalizeRankingItems(rows);
  return { items, total: items.length, currencyCode, period: `${calendar.year}-${String(calendar.month).padStart(2, '0')}`, ...valuation(items.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0)) };
};


const getEntityRankings = async (clubId: string, limitQuery: unknown, fetchRows: typeof getRankingBySector): Promise<JsonRecord> => {
  const limit = parseLimit(limitQuery, 5);
  const calendar = await getClubCalendarNow(clubId);
  const [month, annual] = await Promise.all([
    getClubMonthWindow(clubId, calendar.year, calendar.month),
    getClubYearToDateWindow(clubId, calendar.year),
  ]);
  const [monthlyItems, annualItems, currencyCode] = await Promise.all([
    fetchRows(month.from, new Date(), limit, clubId),
    fetchRows(annual.from, annual.to, limit, clubId),
    getClubCurrencyCode(clubId),
  ]);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { timeZone: calendar.timezone, month: "long" }).format(month.from);
  const monthlyRanking = normalizeRankingItems(monthlyItems);
  const annualRanking = normalizeRankingItems(annualItems);
  return {
    currencyCode,
    ...valuation(annualRanking.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0)),
    monthly: { label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), year: calendar.year, month: calendar.month, timezone: calendar.timezone, currencyCode, ...valuation(monthlyRanking.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0)), items: monthlyRanking, total: monthlyItems.length },
    annual: { year: calendar.year, timezone: calendar.timezone, currencyCode, ...valuation(annualRanking.reduce((sum, item) => sum + toInteger(item.missingRateCount), 0)), items: annualRanking, total: annualItems.length },
  };
};

export const getSectorRankings = async (clubId: string, limitQuery?: unknown): Promise<JsonRecord> =>
  getEntityRankings(clubId, limitQuery, getRankingBySector);

export const getActivityRankings = async (clubId: string, limitQuery?: unknown): Promise<JsonRecord> =>
  getEntityRankings(clubId, limitQuery, getRankingByActivity);

const normalizeTrendItems = (rows: EconomyRow[] | JsonRecord[]): JsonRecord[] => normalizeRows(rows as EconomyRow[]).map((item) => {
  const income = nullableNumber(item.income);
  const expenses = nullableNumber(item.expenses);
  return {
    ...item,
    id: item.id ?? null,
    name: toText(item.name, "Sin clasificar"),
    income,
    expenses,
    balance: item.balance === undefined ? income === null || expenses === null ? null : income - expenses : nullableNumber(item.balance),
    ...valuation(item.missingRateCount),
    movements: toInteger(item.movements),
    month: toInteger(item.month),
    period: toText(item.period),
    rank: toInteger(item.rank),
  };
});

const getEntityTrends = async (clubId: string, yearQuery: unknown, limitQuery: unknown, fetchRows: typeof getSectorTrendRows): Promise<JsonRecord> => {
  const calendar = await getClubCalendarNow(clubId);
  const year = parseYear(yearQuery ?? calendar.year);
  const limit = parseLimit(limitQuery, 5);
  const items = normalizeTrendItems(await fetchRows(year, limit, clubId));
  return { year, timezone: calendar.timezone, items, total: items.length };
};

export const getSectorTrends = async (clubId: string, yearQuery?: unknown, limitQuery?: unknown): Promise<JsonRecord> =>
  getEntityTrends(clubId, yearQuery, limitQuery, getSectorTrendRows);

export const getActivityTrends = async (clubId: string, yearQuery?: unknown, limitQuery?: unknown): Promise<JsonRecord> =>
  getEntityTrends(clubId, yearQuery, limitQuery, getActivityTrendRows);

const normalizePaymentItems = (rows: EconomyRow[] | JsonRecord[]): JsonRecord[] => {
  const items = normalizeRows(rows as EconomyRow[]).map((item) => ({
    ...item,
    id: item.id ?? null,
    name: toText(item.name, "Sin método"),
    amount: nullableNumber(item.amount),
    ...valuation(item.missingRateCount),
    movements: toInteger(item.movements),
  }));
  const incomplete = items.some(item => item.amount === null);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  return items.map((item) => ({
    ...item,
    percentage: incomplete ? null : totalAmount > 0 ? (toNumber(item.amount) / totalAmount) * 100 : 0,
  }));
};

export const getPaymentMethods = async (clubId: string): Promise<JsonRecord> => {
  const calendar = await getClubCalendarNow(clubId);
  const month = await getClubMonthWindow(clubId, calendar.year, calendar.month);
  const now = new Date();
  const annual = await getClubYearToDateWindow(clubId, calendar.year);
  const [monthlyRows, annualRows, auxiliaryRows, statusRows, currencyCode] = await Promise.all([
    getPaymentMethodRows(month.from, now, clubId),
    getPaymentMethodRows(annual.from, annual.to, clubId),
    getEconomyAuxiliarySummary(month.from, annual.from, now, clubId),
    getMovementStatusCounts(month.from, now, clubId),
    getClubCurrencyCode(clubId),
  ]);
  const auxiliary = normalizeRows(auxiliaryRows);
  const auxiliaryByPeriod = new Map(auxiliary.map((row) => [toText(row.periodKey), row]));
  const period = (key: string) => auxiliaryByPeriod.get(key) ?? {};
  const statusCounts = { completed: 0, pending: 0, canceled: 0, review: 0, other: 0 };
  for (const row of normalizeRows(statusRows)) {
    const status = toText(row.status);
    const count = toInteger(row.movements);
    if (["COMPLETADO", "COMPLETED"].includes(status)) statusCounts.completed += count;
    else if (["PENDIENTE", "PENDING"].includes(status)) statusCounts.pending += count;
    else if (["ANULADO", "CANCELADO", "CANCELED", "CANCELLED"].includes(status)) statusCounts.canceled += count;
    else if (["A REVISAR", "REVISION", "REVISAR"].includes(status)) statusCounts.review += count;
    else statusCounts.other += count;
  }
  const monthlyItems = normalizePaymentItems(monthlyRows);
  const annualItems = normalizePaymentItems(annualRows);
  return {
    currencyCode,
    ...valuation(toInteger(period('annual').missingRateCount)),
    items: monthlyItems,
    total: monthlyItems.length,
    monthly: { label: new Intl.DateTimeFormat('es-AR', { timeZone: calendar.timezone, month: 'long' }).format(month.from), items: monthlyItems, total: monthlyItems.length },
    annual: { year: calendar.year, items: annualItems, total: annualItems.length },
    statusCounts,
    nonOperatingExpenses: {
      categories: [...NON_OPERATING_EXPENSE_CATEGORIES],
      monthly: { amount: nullableNumber(period("monthly").nonOperatingBalance), movements: toInteger(period("monthly").nonOperatingMovements) },
      annual: { amount: nullableNumber(period("annual").nonOperatingBalance), movements: toInteger(period("annual").nonOperatingMovements) },
    },
    debtLiabilities: {
      categories: [...DEBT_LIABILITY_CATEGORIES],
      monthly: { amount: nullableNumber(period("monthly").debtLiabilityBalance), movements: toInteger(period("monthly").debtLiabilityMovements) },
      annual: { amount: nullableNumber(period("annual").debtLiabilityBalance), movements: toInteger(period("annual").debtLiabilityMovements) },
    },
    servicesAndTaxes: {
      services: { categories: [...SERVICE_CATEGORIES], monthly: nullableNumber(period("monthly").servicesBalance), annual: nullableNumber(period("annual").servicesBalance) },
      taxes: { categories: [...TAX_CATEGORIES], monthly: nullableNumber(period("monthly").taxesBalance), annual: nullableNumber(period("annual").taxesBalance) },
    },
  };
};

export const getRecentMovements = async (clubId: string, limitQuery?: unknown): Promise<{ items: JsonRecord[]; total: number }> => {
  const items = normalizeRows(await getRecentMovementRows(parseLimit(limitQuery, 20), clubId));
  return { items, total: items.length };
};

export const getPending = async (clubId: string, limitQuery?: unknown): Promise<JsonRecord> => {
  const [summary, items, currencyCode] = await Promise.all([
    getPendingSummaryRows(clubId),
    getPendingMovementRows(parseLimit(limitQuery, 20), clubId),
    getClubCurrencyCode(clubId),
  ]);
  const [pendingSummary] = normalizeRows(summary);
  const pendingItems = normalizeRows(items);
  return {
    pendingBalance: nullableNumber(pendingSummary?.pendingBalance),
    pendingIncome: nullableNumber(pendingSummary?.pendingIncome),
    pendingExpenses: nullableNumber(pendingSummary?.pendingExpenses),
    currencyCode,
    ...valuation(pendingSummary?.missingRateCount),
    pendingMovements: toInteger(pendingSummary?.pendingMovements),
    items: pendingItems,
    total: toInteger(pendingSummary?.pendingMovements) || pendingItems.length,
  };
};

export const getAnnualSummary = async (clubId: string, yearQuery?: unknown): Promise<JsonRecord> => {
  const year = yearQuery === undefined ? (await getClubCalendarNow(clubId)).year : parseYear(yearQuery);
  const [rows, currencyCode] = await Promise.all([getAnnualSummaryRows(clubId, year), getClubCurrencyCode(clubId)]);
  const [summary] = normalizeRows(rows);
  return {
    year: toInteger(summary?.year) || year,
    income: nullableNumber(summary?.income),
    expenses: nullableNumber(summary?.expenses),
    balance: nullableNumber(summary?.balance),
    currencyCode,
    ...valuation(summary?.missingRateCount),
    movements: toInteger(summary?.movements),
  };
};

export const getComparison = async (clubId: string): Promise<JsonRecord> => {
  // Todas las tarjetas de cabecera comparten el mismo reloj de negocio que Crecimiento:
  // los dos últimos meses calendario completos, con límites semiabiertos [inicio, fin).
  const calendar = await getClubCalendarNow(clubId);
  const monthPoint = (offset: number) => {
    const date = new Date(Date.UTC(calendar.year, calendar.month - 1 + offset, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  };
  const [previousWindow, currentWindow, nextWindow] = await Promise.all([-2, -1, 0].map(async offset => {
    const point = monthPoint(offset);
    return getClubMonthWindow(clubId, point.year, point.month);
  }));
  const formatter = new Intl.DateTimeFormat('es-AR', { timeZone: calendar.timezone, month: 'long', year: 'numeric' });
  const months = {
    previousStart: previousWindow.from, currentStart: currentWindow.from, currentEnd: nextWindow.from,
    previousLabel: formatter.format(previousWindow.from), currentLabel: formatter.format(currentWindow.from),
  };
  const [rows, growthRows, currencyCode] = await Promise.all([
    getCompletedMonthMovementSummary(months.previousStart, months.currentStart, months.currentEnd, OPERATING_CATEGORIES, clubId).then(normalizeRows),
    getGrowthSummary(months.previousStart, months.currentStart, months.currentEnd, clubId).then(normalizeRows),
    getClubCurrencyCode(clubId),
  ]);
  const previous = rows.find((row) => row.periodKey === "previous") ?? {};
  const current = rows.find((row) => row.periodKey === "current") ?? {};
  const metric = (key: string, label: string, field: string, inverseImpact = false): JsonRecord => {
    const currentValue = nullableNumber(current[field]);
    const previousValue = nullableNumber(previous[field]);
    return currentValue === null || previousValue === null
      ? { key, label, current: currentValue, previous: previousValue, percentageChange: null, comparable: false, available: false, reason: 'Cotización oficial faltante', applies: true }
      : { key, label, ...calculateVariation(currentValue, previousValue, inverseImpact), applies: true };
  };
  const previousGrowth = growthRows.find((row) => row.periodKey === "previous") ?? {};
  const currentGrowth = growthRows.find((row) => row.periodKey === "current") ?? {};
  const economicGrowth = currentGrowth.income === null || previousGrowth.income === null ? null : calculateVariation(toNumber(currentGrowth.income), toNumber(previousGrowth.income));
  const clientGrowth = calculateVariation(toNumber(currentGrowth.enrollments), toNumber(previousGrowth.enrollments));
  const growthComparable = economicGrowth !== null && economicGrowth.percentageChange !== null && clientGrowth.percentageChange !== null;
  const growthPercentage = growthComparable
    ? ((economicGrowth?.percentageChange ?? 0) + (clientGrowth.percentageChange ?? 0)) / 2
    : null;
  const growth = {
    key: "growth", label: "Crecimiento", current: growthPercentage ?? 0, previous: 0, absoluteChange: growthPercentage ?? 0,
    percentageChange: growthPercentage, direction: growthPercentage === null || growthPercentage === 0 ? "stable" : growthPercentage > 0 ? "up" : "down",
    comparable: growthComparable, available: growthComparable, applies: true,
    impact: growthPercentage === null || growthPercentage === 0 ? "neutral" : growthPercentage > 0 ? "favorable" : "unfavorable",
    currentPeriod: months.currentLabel, previousPeriod: months.previousLabel,
    economicGrowth: economicGrowth?.percentageChange ?? null, clientGrowth: clientGrowth.percentageChange,
  };
  const items = [
    metric("income", "Variación de Ingresos", "income"),
    metric("expenses", "Variación de Egresos", "expenses", true),
    metric("utility", "Variación de Utilidad", "utility"),
    growth,
    metric("operatingProfitability", "Rentabilidad Operativa", "operatingProfitability"),
  ];
  return {
    currencyCode,
    currentPeriod: months.currentLabel,
    previousPeriod: months.previousLabel,
    completedMonthComparison: {
      previousStart: months.previousStart.toISOString(),
      currentStart: months.currentStart.toISOString(),
      currentEnd: months.currentEnd.toISOString(),
      timezone: calendar.timezone,
    },
    items,
    total: items.length,
  };
};

export const getInsights = async (clubId: string): Promise<{ items: JsonRecord[]; total: number }> => {
  const calendar = await getClubCalendarNow(clubId);
  const monthWindow = await getClubMonthWindow(clubId, calendar.year, calendar.month);
  const [baseRows, comparison, summary, qualityRows] = await Promise.all([
    getBaseInsights(clubId).then(normalizeRows),
    getComparison(clubId),
    getMonthlySummary(monthWindow.from, monthWindow.to, clubId).then(normalizeRows),
    getEconomyDataQuality(clubId).then(normalizeRows),
  ]);
  const valueByMetric = new Map(baseRows.map((row) => [toText(row.metric), toNumber(row.value)]));
  const pendingCount = valueByMetric.get("pending_count") ?? 0;
  const metric = (key: string) => (comparison.items as JsonRecord[]).find((item) => item.key === key);
  const income = metric("income");
  const expenses = metric("expenses");
  const utility = metric("utility");
  const operating = metric("operatingProfitability");
  const quality = qualityRows[0] ?? {};
  const monthly = summary[0] ?? {};
  const items: JsonRecord[] = [
    { key: "monthly_balance", type: monthly.balance === null ? "warning" : toNumber(monthly.balance) >= 0 ? "positive" : "warning", title: "Balance mensual", message: monthly.balance === null ? "Balance mensual incompleto: falta cotización oficial" : `Balance mensual ${toNumber(monthly.balance) >= 0 ? "positivo" : "negativo"}`, metric: "month.balance", period: `${calendar.year}-${String(calendar.month).padStart(2, '0')}`, value: nullableNumber(monthly.balance) },
    { key: "income_rolling", type: income?.impact === "favorable" ? "positive" : income?.direction === "stable" ? "info" : "warning", title: "Ingresos móviles", message: income?.comparable === false ? "Ingresos sin base comparable en la ventana anterior" : `Ingresos ${income?.direction === "up" ? "en crecimiento" : income?.direction === "down" ? "en caída" : "estables"} en últimos 30 días`, metric: "rolling.income", period: "Últimos 30 días", value: income?.percentageChange ?? null },
    { key: "expense_rolling", type: expenses?.impact === "favorable" ? "positive" : expenses?.direction === "stable" ? "info" : "warning", title: "Egresos móviles", message: expenses?.comparable === false ? "Egresos sin base comparable en la ventana anterior" : `Egresos ${expenses?.direction === "up" ? "crecieron" : expenses?.direction === "down" ? "bajaron" : "estables"} contra los 30 días anteriores`, metric: "rolling.expenses", period: "Últimos 30 días", value: expenses?.percentageChange ?? null },
    { key: "utility_rolling", type: utility?.impact === "favorable" ? "positive" : utility?.direction === "stable" ? "info" : "warning", title: "Utilidad móvil", message: `Utilidad ${utility?.direction === "up" ? "mejoró" : utility?.direction === "down" ? "retrocedió" : "se mantuvo"} contra la ventana anterior`, metric: "rolling.utility", period: "Últimos 30 días", value: utility?.percentageChange ?? null },
    { key: "operating_profitability", type: toNumber(operating?.current) < 0 ? "warning" : operating?.impact === "favorable" ? "positive" : "info", title: "Rentabilidad operativa", message: toNumber(operating?.current) < 0 ? "Rentabilidad operativa negativa en los últimos 30 días" : `Rentabilidad operativa ${operating?.direction === "up" ? "en crecimiento" : operating?.direction === "down" ? "deteriorándose" : "estable"}`, metric: "rolling.operatingProfitability", period: "Últimos 30 días", value: operating?.percentageChange ?? null },
    { key: "pending_movements", type: pendingCount > 0 ? "warning" : "positive", title: "Pendientes", message: pendingCount > 0 ? `${pendingCount} movimientos pendientes requieren seguimiento` : "No hay movimientos pendientes", metric: "pending.count", period: "Actual", value: pendingCount },
    { key: "data_quality", type: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) > 0 ? "warning" : "positive", title: "Calidad de datos", message: `Sin sector: ${toNumber(quality.missingSector)} · sin categoría: ${toNumber(quality.missingCategory)} · sin medio: ${toNumber(quality.missingPaymentMethod)}`, metric: "dataQuality", period: "Histórico", value: toNumber(quality.missingSector) + toNumber(quality.missingCategory) + toNumber(quality.missingPaymentMethod) },
  ];
  const unique = Array.from(new Map(items.map((item) => [item.key, item])).values());
  const priority: Record<string, number> = { warning: 0, info: 1, positive: 2 };
  unique.sort((a, b) => (priority[String(a.type)] ?? 3) - (priority[String(b.type)] ?? 3));
  return { items: unique.slice(0, 8), total: unique.length };
};
