const MONEY_SCALE = 100;

export const ACTIVITY_SETTLEMENT_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type ActivityTerm = {
  id: string;
  activityId: string;
  sectorId: string;
  mode: "VARIABLE" | "FIXED";
  monthlyFixedFee?: number | null;
  responsibleSharePercentage?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type ActivitySettlementIncome = {
  activityId: string;
  occurredAt: string | Date;
  amount: number;
  status: string;
  voidedAt?: string | Date | null;
};

export type ActivitySettlementAllocation = {
  activityId: string;
  occurredAt: string | Date;
  amount: number;
  kind: "PAYMENT" | "ADVANCE" | "SETTLEMENT_ADJUSTMENT";
  status: string;
  voidedAt?: string | Date | null;
};

export type SettlementPeriod = { from: string; to: string };

export type ActivitySettlementResult = {
  activityId: string;
  sectorId: string;
  termId: string;
  mode: ActivityTerm["mode"];
  completedIncome: number;
  responsibleGross: number;
  completedAllocations: number;
  responsibleBalance: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
const completed = (status: string) => ["COMPLETADO", "COMPLETED"].includes(status.trim().toUpperCase());
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateAtUtc = (value: string) => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number) => {
  const date = dateAtUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const endOfMonth = (value: string) => {
  const date = dateAtUtc(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
const fullMonthCount = (from: string, to: string) => {
  const start = dateAtUtc(from);
  const end = dateAtUtc(to);
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
};

const localDate = (value: string | Date): string => {
  if (typeof value === "string" && ISO_DATE.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid settlement date: ${String(value)}`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACTIVITY_SETTLEMENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
};

export const selectEffectiveActivityTerm = (terms: ActivityTerm[], date: string): ActivityTerm | undefined =>
  terms.find((term) => term.effectiveFrom <= date && (!term.effectiveTo || term.effectiveTo >= date));

/** Rejects ambiguous histories before calculating; the database enforces the same invariant. */
export const validateActivityTerms = (terms: ActivityTerm[]): void => {
  const byActivity = terms.reduce((groups, term) => {
    groups.set(term.activityId, [...(groups.get(term.activityId) ?? []), term]);
    return groups;
  }, new Map<string, ActivityTerm[]>());
  for (const [activityId, activityTerms] of byActivity) {
    const sorted = [...activityTerms].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
    sorted.forEach((term) => {
      if (!ISO_DATE.test(term.effectiveFrom) || (term.effectiveTo && !ISO_DATE.test(term.effectiveTo))) throw new Error(`Invalid activity term date for ${activityId}`);
      if (term.effectiveTo && term.effectiveTo < term.effectiveFrom) throw new Error(`Invalid activity term range for ${activityId}`);
      if (term.mode === "VARIABLE" && !(term.responsibleSharePercentage != null && term.responsibleSharePercentage >= 0 && term.responsibleSharePercentage <= 100 && term.monthlyFixedFee == null)) throw new Error(`Invalid VARIABLE term for ${activityId}`);
      if (term.mode === "FIXED" && !(term.monthlyFixedFee != null && term.monthlyFixedFee >= 0 && term.responsibleSharePercentage == null)) throw new Error(`Invalid FIXED term for ${activityId}`);
    });
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous.effectiveTo || current.effectiveFrom <= previous.effectiveTo) throw new Error(`Overlapping activity terms for ${activityId}`);
      if (current.effectiveFrom !== addDays(previous.effectiveTo, 1)) throw new Error(`Gap between activity terms for ${activityId}`);
    }
  }
};

/**
 * Positive balance means an amount owed to the activity responsible.
 * VARIABLE: income assigned by Buenos Aires calendar date × responsible share.
 * FIXED: income − one whole monthly fee per covered calendar month. Partial months
 * are deliberately rejected instead of being prorated.
 * Payments and advances enter only through explicit settlement allocations.
 */
export const calculateActivitySettlements = (input: {
  period: SettlementPeriod;
  terms: ActivityTerm[];
  incomes: ActivitySettlementIncome[];
  allocations: ActivitySettlementAllocation[];
}): ActivitySettlementResult[] => {
  if (!ISO_DATE.test(input.period.from) || !ISO_DATE.test(input.period.to) || input.period.from > input.period.to) throw new Error("Invalid settlement period");
  validateActivityTerms(input.terms);
  const activityIds = new Set(input.terms.map((term) => term.activityId));
  return [...activityIds].sort().flatMap((activityId) => {
    const terms = input.terms.filter((term) => term.activityId === activityId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const applicable = terms.filter((term) => term.effectiveFrom <= input.period.to && (!term.effectiveTo || term.effectiveTo >= input.period.from));
    if (!selectEffectiveActivityTerm(terms, input.period.from) || !selectEffectiveActivityTerm(terms, input.period.to)) throw new Error(`Activity terms do not cover settlement period for ${activityId}`);

    return applicable.map((term) => {
      const from = term.effectiveFrom > input.period.from ? term.effectiveFrom : input.period.from;
      const to = term.effectiveTo && term.effectiveTo < input.period.to ? term.effectiveTo : input.period.to;
      if (term.mode === "FIXED" && (!from.endsWith("-01") || to !== endOfMonth(to))) throw new Error(`FIXED settlements require complete calendar months for ${activityId}`);
      const belongs = (value: string | Date) => {
        const day = localDate(value);
        return day >= from && day <= to;
      };
      const completedIncome = money(input.incomes
        .filter((row) => row.activityId === activityId && completed(row.status) && !row.voidedAt && belongs(row.occurredAt))
        .reduce((total, row) => total + row.amount, 0));
      const completedAllocations = money(input.allocations
        .filter((row) => row.activityId === activityId && completed(row.status) && !row.voidedAt && belongs(row.occurredAt))
        .reduce((total, row) => total + row.amount, 0));
      const responsibleGross = term.mode === "VARIABLE"
        ? money(completedIncome * (term.responsibleSharePercentage! / 100))
        : money(completedIncome - term.monthlyFixedFee! * fullMonthCount(from, to));
      return { activityId, sectorId: term.sectorId, termId: term.id, mode: term.mode, completedIncome,
        responsibleGross, completedAllocations, responsibleBalance: money(responsibleGross - completedAllocations) };
    });
  });
};

export const aggregateActivitySettlementsBySector = (rows: ActivitySettlementResult[]) =>
  [...rows.reduce((totals, row) => totals.set(row.sectorId, money((totals.get(row.sectorId) ?? 0) + row.responsibleBalance)), new Map<string, number>())]
    .map(([sectorId, responsibleBalance]) => ({ sectorId, responsibleBalance }));
