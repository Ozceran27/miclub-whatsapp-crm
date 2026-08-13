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
const completed = (status: string) => status.trim().toUpperCase() === "COMPLETADO" || status.trim().toUpperCase() === "COMPLETED";

const localDate = (value: string | Date): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid settlement date: ${String(value)}`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACTIVITY_SETTLEMENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
};

export const selectEffectiveActivityTerm = (terms: ActivityTerm[], date: string): ActivityTerm | undefined =>
  terms
    .filter((term) => term.effectiveFrom <= date && (!term.effectiveTo || term.effectiveTo >= date))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];

/**
 * Positive balance always means an amount owed to the activity responsible.
 * VARIABLE: completed income × responsible share − completed allocations.
 * FIXED (approved rule): completed income − monthly fixed fee − completed allocations.
 */
export const calculateActivitySettlements = (input: {
  period: SettlementPeriod;
  terms: ActivityTerm[];
  incomes: ActivitySettlementIncome[];
  allocations: ActivitySettlementAllocation[];
}): ActivitySettlementResult[] => {
  if (input.period.from > input.period.to) throw new Error("Settlement period start must not be after its end");
  const activityIds = new Set(input.terms.map((term) => term.activityId));
  return [...activityIds].sort().flatMap((activityId) => {
    const term = selectEffectiveActivityTerm(input.terms.filter((item) => item.activityId === activityId), input.period.to);
    if (!term) return [];
    const inPeriod = (value: string | Date) => {
      const day = localDate(value);
      return day >= input.period.from && day <= input.period.to;
    };
    const completedIncome = money(input.incomes
      .filter((row) => row.activityId === activityId && completed(row.status) && !row.voidedAt && inPeriod(row.occurredAt))
      .reduce((total, row) => total + row.amount, 0));
    const completedAllocations = money(input.allocations
      .filter((row) => row.activityId === activityId && completed(row.status) && !row.voidedAt && inPeriod(row.occurredAt))
      .reduce((total, row) => total + row.amount, 0));
    const responsibleGross = term.mode === "VARIABLE"
      ? money(completedIncome * ((term.responsibleSharePercentage ?? 0) / 100))
      : money(completedIncome - (term.monthlyFixedFee ?? 0));
    return [{ activityId, sectorId: term.sectorId, termId: term.id, mode: term.mode, completedIncome,
      responsibleGross, completedAllocations, responsibleBalance: money(responsibleGross - completedAllocations) }];
  });
};

export const aggregateActivitySettlementsBySector = (rows: ActivitySettlementResult[]) =>
  [...rows.reduce((totals, row) => totals.set(row.sectorId, money((totals.get(row.sectorId) ?? 0) + row.responsibleBalance)), new Map<string, number>())]
    .map(([sectorId, responsibleBalance]) => ({ sectorId, responsibleBalance }));
