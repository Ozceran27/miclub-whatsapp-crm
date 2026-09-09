import { isEconomyOperationalStatus, isPendingMovementStatus, normalizeMovementAmount } from "@miclub/shared";
import type { FinancialProjection, FinancialProjectionComponent } from '@miclub/shared';

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export interface PendingMovementInput {
  id: string | number;
  movementType: unknown;
  amount: unknown;
  operationalStatus?: unknown;
  financialStatus?: unknown;
  sourceSheet?: unknown;
}

export interface OperationalBalancesInput {
  liquidity: unknown;
  feesToCollect: unknown;
  settlementBalance: unknown;
  pendingBalance: unknown;
}

export interface DynamicSectorBalance { sectorId: string; sectorName: string; amount: number }

const normalizeText = (value: unknown): string => (typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  ? String(value)
  : "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

export const isPendingAdministrationMovement = (movement: PendingMovementInput): boolean => {
  const source = normalizeText(movement.sourceSheet);
  const operational = normalizeText(movement.operationalStatus);
  return (source === "ADMINISTRACION" || source === "ADMIN")
    && isEconomyOperationalStatus(operational)
    && isPendingMovementStatus(operational);
};

export const calculatePendingBalance = (movements: PendingMovementInput[]): { income: number; expenses: number; net: number } => {
  const seen = new Set<string>();
  let income = 0;
  let expenses = 0;
  for (const movement of movements) {
    const id = String(movement.id);
    if (!id || seen.has(id) || !isPendingAdministrationMovement(movement)) continue;
    seen.add(id);
    const type = normalizeText(movement.movementType);
    if (type === "INGRESOS") income += normalizeMovementAmount(movement.amount);
    else if (type === "EGRESOS") expenses += normalizeMovementAmount(movement.amount);
  }
  income = money(income);
  expenses = money(expenses);
  return { income, expenses, net: money(income - expenses) };
};

export const calculateOperationalBalances = (input: OperationalBalancesInput) => {
  const liquidity = money(normalizeMovementAmount(input.liquidity));
  const feesToCollect = money(normalizeMovementAmount(input.feesToCollect));
  const settlementBalance = money(normalizeMovementAmount(input.settlementBalance));
  const pendingBalance = money(normalizeMovementAmount(input.pendingBalance));
  return {
    liquidity,
    feesToCollect,
    settlementBalance,
    pendingBalance,
    projectedBalance: money(liquidity + feesToCollect + settlementBalance + pendingBalance),
  };
};

/** Tenant-scoped replacement for fixed Fitness/Salón/Aula/Local keys. */
export const calculateDynamicSettlementBalance = (settlements: DynamicSectorBalance[]) => {
  const bySector = new Map<string, DynamicSectorBalance>();
  for (const row of settlements) {
    if (!row.sectorId || bySector.has(row.sectorId)) continue;
    bySector.set(row.sectorId, { ...row, amount: money(normalizeMovementAmount(row.amount)) });
  }
  const sectors = [...bySector.values()].sort((a, b) => a.sectorName.localeCompare(b.sectorName, "es"));
  return { sectors, total: money(sectors.reduce((sum, row) => sum + row.amount, 0)) };
};

/**
 * DEC-017 projection contract. Inputs are already valued in the club currency.
 * Missing valuation yields null totals, never a fabricated exchange rate.
 * Each component represents one obligation (not a movement/receivable copy).
 */
export function calculateFinancialProjection(input: {
  calculatedAt: string;
  currencyCode: string;
  liquidity: number | null;
  pendingCollections: FinancialProjectionComponent[];
  pendingPayments: { obligationId: string; amount: number }[];
  pendingSettlements: { obligationId: string; amount: number }[];
  unpaidReceivables: (FinancialProjectionComponent & { abandoned: boolean })[];
  assumptions?: string[];
  missingValuations?: string[];
}): FinancialProjection {
  const validate = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Invalid projection amount');
    return money(value);
  };
  const amounts = new Map<string, number>();
  const unique = <T extends { obligationId: string; amount: number }>(rows: T[]): T[] => {
    const result: T[] = [];
    for (const row of rows) {
      if (!row.obligationId) throw new Error('Projection requires obligation identifiers');
      const amount = validate(row.amount);
      const previous = amounts.get(row.obligationId);
      if (previous !== undefined) {
        if (previous !== amount) throw new Error('Conflicting obligation requires reconciliation');
        continue;
      }
      amounts.set(row.obligationId, amount);
      result.push(row);
    }
    return result;
  };
  const share = (row: FinancialProjectionComponent) => {
    const amount = validate(row.responsibleAmount);
    if (amount > validate(row.amount)) throw new Error('Responsible share exceeds collection');
    return amount;
  };
  // Validate copies before deduplicating: a divergent attribution needs review.
  const shares = new Map<string, number>();
  for (const row of [...input.pendingCollections, ...input.unpaidReceivables.filter(row => !row.abandoned)]) {
    const amount = share(row);
    if (shares.has(row.obligationId) && shares.get(row.obligationId) !== amount) throw new Error('Conflicting responsible share requires reconciliation');
    shares.set(row.obligationId, amount);
  }
  const collections = unique(input.pendingCollections);
  const extra = unique(input.unpaidReceivables.filter(row => !row.abandoned));
  // Receipt and disbursement namespaces are distinct, but a pending payment
  // linked to a settlement takes precedence over that settlement's copy.
  amounts.clear();
  const payments = unique(input.pendingPayments);
  const settlements = unique(input.pendingSettlements);
  const sum = (rows: { amount: number }[]) => money(rows.reduce((total, row) => total + validate(row.amount), 0));
  const pendingCollections = sum(collections);
  const pendingPayments = sum(payments);
  const pendingSettlements = sum(settlements);
  const expectedSettlements = money(collections.reduce((total, row) => {
    const expected = share(row);
    if (row.responsibleObligationId && amounts.has(row.responsibleObligationId)) {
      if (amounts.get(row.responsibleObligationId) !== expected) throw new Error('Conflicting forecast settlement requires reconciliation');
      return total;
    }
    return total + expected;
  }, 0));
  const additionalClubReceivables = money(extra.reduce((total, row) => total + validate(row.amount) - share(row), 0));
  if (input.liquidity !== null && !Number.isFinite(input.liquidity)) throw new Error('Invalid liquidity');
  if (Number.isNaN(new Date(input.calculatedAt).valueOf())) throw new Error('Invalid projection calculation date');
  const complete = input.liquidity !== null && !(input.missingValuations?.length);
  const projectedBalance = complete ? money(input.liquidity! + pendingCollections - pendingPayments - pendingSettlements - expectedSettlements) : null;
  return { calculatedAt: input.calculatedAt, currencyCode: input.currencyCode,
    liquidity: input.liquidity, pendingCollections, pendingPayments, pendingSettlements,
    expectedSettlements, additionalClubReceivables, projectedBalance,
    futureEstimate: projectedBalance === null ? null : money(projectedBalance + additionalClubReceivables),
    complete, assumptions: [...(input.assumptions ?? []), ...(input.missingValuations ?? []).map(id => `Missing valuation: ${id}`)] };
}
