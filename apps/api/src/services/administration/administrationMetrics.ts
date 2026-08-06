import { isCompletedMovementStatus, normalizeAmount } from "../economyDomain.js";

const percentage = (value: number, total: number): number => total === 0 ? 0 : (value / total) * 100;

export const calculateCapacityByPeople = (occupied: number, capacity: number): number =>
  percentage(occupied, capacity);

export const calculateCapacityByAmount = (collected: number, target: number): number =>
  percentage(collected, target);

export const calculateGeneralAverage = (values: number[]): number => {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length === 0
    ? 0
    : finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length;
};

export const calculateGrowth = (current: number, previous: number): number | null =>
  previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100;

export const calculateOperatingProfitability = (income: number, expenses: number): number =>
  normalizeAmount(income) - normalizeAmount(expenses);

export const calculateCommission = (amount: number, commission: number): number => {
  const normalizedCommission = commission > 1 ? commission / 100 : commission;
  return Math.round(normalizeAmount(amount) * normalizedCommission * 100) / 100;
};

export const isValidAdministrationStatus = (status: unknown): boolean =>
  isCompletedMovementStatus(status);
