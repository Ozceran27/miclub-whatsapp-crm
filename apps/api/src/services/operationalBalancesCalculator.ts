import { normalizeMembershipFeeUnit, normalizeMovementAmount } from "@miclub/shared";
import { normalizeOperationalStatus } from "./googleSheets.js";

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export type OperationalSector = "FITNESS" | "SALON" | "AULA" | "LOCAL_1" | string;

export interface ReceivableEnrollmentInput {
  enrollmentId: string | number;
  status: unknown;
  feeAmount: unknown;
  sector: OperationalSector;
  activityCommissionPercent?: unknown;
}

export interface SettlementInput {
  sector: OperationalSector;
  amount: unknown;
  metricKey?: string | null;
}

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

export interface FeesToCollectBreakdown {
  total: number;
  fitness: number;
  salon: number;
  aula: number;
  other: number;
  enrollmentCount: number;
}

const normalizeText = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

export const normalizeCommissionRate = (value: unknown): number => {
  const numeric = normalizeMovementAmount(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const rate = numeric > 1 ? numeric / 100 : numeric;
  return rate > 1 ? 0 : rate;
};

const normalizeSector = (sector: unknown): OperationalSector => {
  const normalized = normalizeText(sector);
  if (["FITNESS", "ESPACIO_FITNESS", "GYM", "GIMNASIO"].includes(normalized)) return "FITNESS";
  if (["SALON", "SALON_DE_EVENTOS", "EVENTOS"].includes(normalized)) return "SALON";
  if (["AULA", "AULAS"].includes(normalized)) return "AULA";
  if (["LOCAL_1", "LOCAL1", "LOCAL"].includes(normalized)) return "LOCAL_1";
  return normalized;
};

const commissionForEnrollment = (enrollment: ReceivableEnrollmentInput): number => {
  const sector = normalizeSector(enrollment.sector);
  if (sector === "FITNESS") return 0.5;
  if (sector === "SALON") return 0;
  if (sector === "AULA") return normalizeCommissionRate(enrollment.activityCommissionPercent);
  console.warn(`[operational-balances] Sector sin regla explícita para cuotas a cobrar: ${sector || "sin_sector"}`);
  return 0;
};

export const calculateFeesToCollect = (enrollments: ReceivableEnrollmentInput[]): FeesToCollectBreakdown => {
  const seen = new Set<string>();
  const breakdown: FeesToCollectBreakdown = { total: 0, fitness: 0, salon: 0, aula: 0, other: 0, enrollmentCount: 0 };

  for (const enrollment of enrollments) {
    const id = String(enrollment.enrollmentId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (normalizeOperationalStatus(String(enrollment.status ?? "")) !== "adeudando") continue;
    const fee = normalizeMembershipFeeUnit(enrollment.feeAmount);
    if (!Number.isFinite(fee) || fee <= 0) continue;
    const sector = normalizeSector(enrollment.sector);
    const amount = money(fee * commissionForEnrollment(enrollment));
    if (amount <= 0 && sector !== "SALON") continue;
    breakdown.enrollmentCount += 1;
    if (sector === "FITNESS") breakdown.fitness = money(breakdown.fitness + amount);
    else if (sector === "SALON") breakdown.salon = money(breakdown.salon + amount);
    else if (sector === "AULA") breakdown.aula = money(breakdown.aula + amount);
    else breakdown.other = money(breakdown.other + amount);
  }
  breakdown.total = money(breakdown.fitness + breakdown.salon + breakdown.aula + breakdown.other);
  return breakdown;
};

export const calculateSettlementBalance = (settlements: SettlementInput[]): { total: number; local1: number; fitness: number; salon: number; aula: number } => {
  const values = new Map<OperationalSector, number>();
  for (const settlement of settlements) {
    const sector = normalizeSector(settlement.sector);
    if (!["LOCAL_1", "FITNESS", "SALON", "AULA"].includes(sector)) continue;
    if (values.has(sector)) continue;
    values.set(sector, Math.abs(normalizeMovementAmount(settlement.amount)));
  }
  const fitness = money(values.get("FITNESS") ?? 0);
  const salon = money(values.get("SALON") ?? 0);
  const aula = money(values.get("AULA") ?? 0);
  const local1 = money(values.get("LOCAL_1") ?? 0);
  return { total: money((fitness + salon + aula + local1) * -1), local1, fitness, salon, aula };
};

export const isPendingAdministrationMovement = (movement: PendingMovementInput): boolean => {
  const source = normalizeText(movement.sourceSheet);
  const operational = normalizeText(movement.operationalStatus);
  const financial = normalizeText(movement.financialStatus).toLowerCase();
  return (source === "ADMINISTRACION" || source === "ADMIN") && (operational === "PENDIENTE" || financial === "pendiente");
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
  const settlementBalance = -Math.abs(money(normalizeMovementAmount(input.settlementBalance)));
  const pendingBalance = money(normalizeMovementAmount(input.pendingBalance));
  return {
    liquidity,
    feesToCollect,
    settlementBalance,
    pendingBalance,
    projectedBalance: money(liquidity + feesToCollect + settlementBalance + pendingBalance),
  };
};
