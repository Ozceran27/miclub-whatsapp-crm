import type { EconomyRecentMovement } from './types';
import { formatArPeso } from '../../utils';

export const formatEconomyMoney = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? formatArPeso(value) : '—');

export const formatEconomyDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const getMovementAmountLabel = (movement: EconomyRecentMovement) => {
  const sign = movement.movementType === 'EGRESOS' ? '-' : '';
  return `${sign}${formatEconomyMoney(Math.abs(movement.amount))}`;
};

export const getMovementPersonLabel = (movement: EconomyRecentMovement) => {
  const fullName = [movement.firstName, movement.lastName].filter(Boolean).join(' ').trim();
  return fullName || movement.counterpartyText || 'Sin contraparte';
};

export const getMovementTone = (movement: EconomyRecentMovement) => movement.movementType === 'EGRESOS' ? 'negativeCritical' : 'positiveCritical';
