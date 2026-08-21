import { isEconomyOperationalStatus, isPendingMovementStatus, normalizeMovementAmount } from "@miclub/shared";

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
