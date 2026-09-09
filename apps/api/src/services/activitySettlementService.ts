import type { MonthlySettlementLine, PartialMonthPolicy, ResponsibleCompensation } from '@miclub/shared';

const MONEY_SCALE = 100;

export const ACTIVITY_SETTLEMENT_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type ActivityTerm = {
  id: string;
  activityId: string;
  sectorId: string;
  mode: "VARIABLE" | "FIXED";
  fixedClubFee?: number | null;
  fixedFeeFrequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  clubSharePercentage?: number | null;
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
const fixedPeriodCount = (from: string, to: string, frequency: NonNullable<ActivityTerm["fixedFeeFrequency"]>) => {
  const days = Math.round((dateAtUtc(to).valueOf() - dateAtUtc(from).valueOf()) / 86_400_000) + 1;
  if (frequency === "DAILY") return days;
  if (frequency === "WEEKLY") return Math.ceil(days / 7);
  if (frequency === "MONTHLY") return fullMonthCount(from, to);
  return Math.ceil(fullMonthCount(from, to) / 12);
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
      if (term.mode === "VARIABLE" && !(term.clubSharePercentage != null && term.clubSharePercentage >= 0 && term.clubSharePercentage <= 100 && term.fixedClubFee == null && term.fixedFeeFrequency == null)) throw new Error(`Invalid VARIABLE term for ${activityId}`);
      if (term.mode === "FIXED" && !(term.fixedClubFee != null && term.fixedClubFee >= 0 && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(term.fixedFeeFrequency)) && term.clubSharePercentage == null)) throw new Error(`Invalid FIXED term for ${activityId}`);
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
 * FIXED: income − the configured club fee for each covered frequency unit.
 * Monthly terms require complete calendar months instead of implicit prorating.
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
      if (term.mode === "FIXED" && term.fixedFeeFrequency === "MONTHLY" && (!from.endsWith("-01") || to !== endOfMonth(to))) throw new Error(`MONTHLY FIXED settlements require complete calendar months for ${activityId}`);
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
        ? money(completedIncome * ((100 - term.clubSharePercentage!) / 100))
        : money(completedIncome - term.fixedClubFee! * fixedPeriodCount(from, to, term.fixedFeeFrequency!));
      return { activityId, sectorId: term.sectorId, termId: term.id, mode: term.mode, completedIncome,
        responsibleGross, completedAllocations, responsibleBalance: money(responsibleGross - completedAllocations) };
    });
  });
};

export const aggregateActivitySettlementsBySector = (rows: ActivitySettlementResult[]) =>
  [...rows.reduce((totals, row) => totals.set(row.sectorId, money((totals.get(row.sectorId) ?? 0) + row.responsibleBalance)), new Map<string, number>())]
    .map(([sectorId, responsibleBalance]) => ({ sectorId, responsibleBalance }));

/** Explicit historical attribution; never substitute the current instructor. */
export interface MonthlyActivityTerm extends ActivityTerm {
  personId: string;
  currencyCode: string;
  partialMonthPolicy?: PartialMonthPolicy;
}

export interface MonthlyCollection extends ActivitySettlementIncome {
  id: string;
  currencyCode: string;
}

export interface MonthlyRefund {
  id: string;
  collectionId: string;
  occurredAt: string | Date;
  amount: number;
  status: string;
  voidedAt?: string | Date | null;
  /** Snapshot established when the refund is recorded, not today's agreement. */
  originalTermId: string;
  originalResponsibleAmount: number;
}

export interface MonthlyResponsiblePayment {
  id: string;
  termId: string;
  /** Period being paid, independent of the cash movement's date. */
  month: string;
  amount: number;
  kind: 'PAYMENT' | 'DEBT_COLLECTION';
  status: string;
  voidedAt?: string | Date | null;
}

const cents = (amount: number): number => {
  const result = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(result) || Math.abs(amount * 100 - result) > 0.00001) {
    throw new Error('Invalid monetary amount');
  }
  return result;
};

const checkedDate = (value: string): string => {
  if (!ISO_DATE.test(value) || Number.isNaN(dateAtUtc(value).valueOf()) || dateAtUtc(value).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date');
  }
  return value;
};

const uniqueIds = (rows: { id: string }[]) => {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error('Duplicate or missing financial identifier');
    ids.add(row.id);
  }
};

/**
 * Monthly engine for DEC-017. Repository must supply one authenticated tenant,
 * complete relevant history (including original collections for refunds), and
 * completed payments with their explicit original term/period attribution.
 * Legacy calculator above remains for its existing nonmonthly contract; callers
 * must opt into this monthly contract instead of silently coercing old terms.
 */
export function calculateMonthlySettlements(input: {
  month: string;
  timeZone: string;
  terms: MonthlyActivityTerm[];
  collections: MonthlyCollection[];
  refunds: MonthlyRefund[];
  payments: MonthlyResponsiblePayment[];
  /** Explicit full-month fee distribution, including zero shares. */
  fullMonthFeeAllocations?: { termId: string; amount: number }[];
}): MonthlySettlementLine[] {
  const from = checkedDate(`${input.month}-01`);
  const to = endOfMonth(from);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = (value: string | Date) => typeof value === 'string' && ISO_DATE.test(value)
    ? checkedDate(value) : formatter.format(new Date(value));
  const inMonth = (value: string | Date) => { const date = day(value); return date >= from && date <= to; };
  const active = (row: { status: string; voidedAt?: string | Date | null }) => completed(row.status) && !row.voidedAt;
  validateActivityTerms(input.terms);
  uniqueIds(input.terms);
  uniqueIds(input.collections);
  uniqueIds(input.refunds);
  uniqueIds(input.payments);
  const terms = new Map(input.terms.map(term => [term.id, term]));
  const collections = new Map(input.collections.map(row => [row.id, row]));
  const rows = new Map<string, MonthlySettlementLine>();
  const rowFor = (term: MonthlyActivityTerm) => {
    if (!term.personId || !term.currencyCode) throw new Error('Historical responsible or currency requires review');
    let row = rows.get(term.id);
    if (!row) {
      row = { activityId: term.activityId, personId: term.personId, termId: term.id,
        currencyCode: term.currencyCode, month: input.month, income: 0, refunds: 0,
        responsibleIncome: 0, responsibleRefunds: 0, fixedClubFee: 0, payments: 0,
        debtCollections: 0, balance: 0, paymentState: 'SETTLED' };
      rows.set(term.id, row);
    }
    return row;
  };
  const applicable = input.terms.filter(term => term.effectiveFrom <= to && (!term.effectiveTo || term.effectiveTo >= from));
  const allocations = new Map<string, number>();
  for (const allocation of input.fullMonthFeeAllocations ?? []) {
    if (allocations.has(allocation.termId)) throw new Error('Duplicate fixed fee allocation');
    const term = applicable.find(item => item.id === allocation.termId);
    if (!term || term.mode !== 'FIXED' || term.partialMonthPolicy !== 'FULL_MONTH') throw new Error('Invalid fixed fee allocation');
    allocations.set(term.id, cents(allocation.amount));
  }
  for (const term of applicable) {
    checkedDate(term.effectiveFrom);
    if (term.effectiveTo) checkedDate(term.effectiveTo);
    const row = rowFor(term);
    if (term.mode !== 'FIXED') continue;
    if (term.fixedFeeFrequency !== 'MONTHLY') throw new Error('Nonmonthly agreement requires review');
    if (!term.partialMonthPolicy) throw new Error('Partial month policy requires review');
    const fee = cents(term.fixedClubFee!);
    const start = term.effectiveFrom > from ? term.effectiveFrom : from;
    const end = term.effectiveTo && term.effectiveTo < to ? term.effectiveTo : to;
    if (term.partialMonthPolicy === 'CALENDAR_DAYS') {
      const days = (dateAtUtc(end).valueOf() - dateAtUtc(start).valueOf()) / 86400000 + 1;
      row.fixedClubFee = Math.round(fee * days / Number(to.slice(-2)));
    } else {
      const peers = applicable.filter(other => other.activityId === term.activityId);
      if (peers.length > 1) {
        if (peers.some(other => other.mode !== 'FIXED' || other.partialMonthPolicy !== 'FULL_MONTH' || other.currencyCode !== term.currencyCode || cents(other.fixedClubFee!) !== fee || !allocations.has(other.id))) {
          throw new Error('Full monthly fee handoff requires explicit distribution');
        }
        if (peers.reduce((sum, other) => sum + allocations.get(other.id)!, 0) !== fee) throw new Error('Fixed fee distribution must equal one monthly fee');
        row.fixedClubFee = allocations.get(term.id)!;
      } else {
        if (allocations.has(term.id) && allocations.get(term.id) !== fee) throw new Error('Fixed fee distribution must equal one monthly fee');
        row.fixedClubFee = fee;
      }
    }
  }
  // Round the cumulative calendar fraction, so adjacent assignments sum to
  // exactly one fee even when the monthly fee is not divisible by the days.
  const prorated = applicable.filter(term => term.mode === 'FIXED' && term.partialMonthPolicy === 'CALENDAR_DAYS')
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const fractions = new Map<string, { exact: number; rounded: number }>();
  for (const term of prorated) {
    const key = JSON.stringify([term.activityId, term.currencyCode, term.fixedClubFee]);
    const total = fractions.get(key) ?? { exact: 0, rounded: 0 };
    const start = term.effectiveFrom > from ? term.effectiveFrom : from;
    const end = term.effectiveTo && term.effectiveTo < to ? term.effectiveTo : to;
    const days = (dateAtUtc(end).valueOf() - dateAtUtc(start).valueOf()) / 86400000 + 1;
    total.exact += cents(term.fixedClubFee!) * days / Number(to.slice(-2));
    const rounded = Math.round(total.exact);
    rowFor(term).fixedClubFee = rounded - total.rounded;
    total.rounded = rounded;
    fractions.set(key, total);
  }
  for (const collection of input.collections) {
    if (!active(collection) || !inMonth(collection.occurredAt)) continue;
    const date = day(collection.occurredAt);
    const term = input.terms.find(item => item.activityId === collection.activityId && item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date));
    if (!term) throw new Error('Collection has no historical agreement');
    if (term.currencyCode !== collection.currencyCode) throw new Error('Collection currency requires explicit conversion');
    const row = rowFor(term);
    const amount = cents(collection.amount);
    row.income += amount;
    row.responsibleIncome += term.mode === 'VARIABLE' ? Math.round(amount * (100 - term.clubSharePercentage!) / 100) : amount;
  }
  const refunded = new Map<string, number>();
  const responsibleRefunded = new Map<string, number>();
  for (const refund of input.refunds) {
    if (!active(refund)) continue;
    const collection = collections.get(refund.collectionId);
    const term = terms.get(refund.originalTermId);
    if (!collection || !active(collection) || !term || term.activityId !== collection.activityId || term.currencyCode !== collection.currencyCode) throw new Error('Invalid refund reference');
    const collectedOn = day(collection.occurredAt);
    if (term.effectiveFrom > collectedOn || (term.effectiveTo && term.effectiveTo < collectedOn)) throw new Error('Refund requires original collection agreement');
    if (day(refund.occurredAt) < day(collection.occurredAt)) throw new Error('Refund precedes collection');
    const amount = cents(refund.amount);
    const responsible = cents(refund.originalResponsibleAmount);
    const original = cents(collection.amount);
    const limit = term.mode === 'FIXED' ? original : Math.round(original * (100 - term.clubSharePercentage!) / 100);
    const total = (refunded.get(collection.id) ?? 0) + amount;
    const totalResponsible = (responsibleRefunded.get(collection.id) ?? 0) + responsible;
    if (total > original || responsible > amount || totalResponsible > limit) throw new Error('Refund exceeds available collection');
    // Enforce the original split, allowing the last cent to reconcile partial refunds.
    const expected = term.mode === 'FIXED' ? amount : Math.round(amount * (100 - term.clubSharePercentage!) / 100);
    if (Math.abs(responsible - expected) > (term.mode === 'FIXED' ? 0 : 1) || (total === original && totalResponsible !== limit)) throw new Error('Refund must reverse original split');
    refunded.set(collection.id, total);
    responsibleRefunded.set(collection.id, totalResponsible);
    if (!inMonth(refund.occurredAt)) continue;
    const row = rowFor(term);
    row.refunds += amount;
    row.responsibleRefunds += responsible;
  }
  for (const payment of input.payments) {
    if (!active(payment) || payment.month !== input.month) continue;
    const term = terms.get(payment.termId);
    if (!term) throw new Error('Payment historical recipient requires review');
    const row = rowFor(term);
    if (payment.kind === 'PAYMENT') row.payments += cents(payment.amount);
    else row.debtCollections += cents(payment.amount);
  }
  return [...rows.values()].map(row => {
    row.balance = row.responsibleIncome - row.responsibleRefunds - row.fixedClubFee - row.payments + row.debtCollections;
    row.paymentState = row.balance < 0 ? 'DEBT' : row.balance === 0 ? 'SETTLED' : row.payments > 0 ? 'PARTIAL' : 'PENDING';
    for (const key of ['income', 'refunds', 'responsibleIncome', 'responsibleRefunds', 'fixedClubFee', 'payments', 'debtCollections', 'balance'] as const) row[key] /= 100;
    return row;
  }).sort((a, b) => a.termId.localeCompare(b.termId));
}

/** A deterministic proposal. Persistence must lock the person's account before paying. */
export function proposeResponsibleCompensations(input: {
  id: string; personId: string; currencyCode: string; month: string; balance: number;
}[]): { compensations: ResponsibleCompensation[]; remaining: { id: string; balance: number }[] } {
  uniqueIds(input);
  const rows = input.map(row => ({ ...row, amount: Math.sign(row.balance) * cents(Math.abs(row.balance)) }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  const compensations: ResponsibleCompensation[] = [];
  for (const debt of rows.filter(row => row.amount < 0)) {
    for (const credit of rows) {
      if (debt.amount === 0) break;
      if (credit.amount <= 0 || credit.personId !== debt.personId || credit.currencyCode !== debt.currencyCode) continue;
      const amount = Math.min(-debt.amount, credit.amount);
      debt.amount += amount;
      credit.amount -= amount;
      compensations.push({ personId: debt.personId, currencyCode: debt.currencyCode, debtLineId: debt.id, creditLineId: credit.id, amount: amount / 100 });
    }
  }
  return { compensations, remaining: rows.map(row => ({ id: row.id, balance: row.amount / 100 })) };
}
