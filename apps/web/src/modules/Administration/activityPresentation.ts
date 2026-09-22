import type { AdministrationActivityDto } from '@miclub/shared';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const dateOnly = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const frequencies = { DAILY: 'diario', WEEKLY: 'semanal', MONTHLY: 'mensual', YEARLY: 'anual' } as const;

export const formatPercentage = (value: number): string => `${number.format(value)}%`;

export const formatMoney = (value: number, currency = 'ARS'): string => {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${integer.format(value)} ${currency}`; }
};

export const formatFrequency = (value?: keyof typeof frequencies | null): string => value ? frequencies[value] : 'por período';

export const formatActivityDate = (value?: string | null): string => {
  if (!value) return 'Sin registro';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return (isDateOnly ? dateOnly : dateTime).format(parsed);
};

export const describeActivityTerms = (activity: AdministrationActivityDto): string => {
  const mode = activity.settlementMode?.toUpperCase();
  if (mode === 'FIXED') return `Fijo ${formatMoney(activity.settlementFixedAmount ?? 0, activity.currencyCode ?? 'ARS')} ${formatFrequency(activity.fixedFeeFrequency)}`;
  if (mode === 'VARIABLE') return `${formatPercentage(activity.clubSharePercentage ?? activity.clubCommissionPercent)} para el club`;
  return 'Sin términos vigentes';
};

export const activityStatusLabel = (value?: string | null): string => ({ active: 'Activa', inactive: 'Inactiva', archived: 'Archivada' }[value ?? ''] ?? value?.replaceAll('_', ' ') ?? 'Sin estado');

export const formatActivityProfitability = (activity: AdministrationActivityDto): string => {
  if (activity.annualOperatingProfitabilityStatus === 'INCOMPLETE_EXCHANGE_RATE') return 'Sin cotización';
  if (activity.annualOperatingProfitabilityStatus === 'NO_MOVEMENTS') return 'Sin movimientos';
  if (activity.annualOperatingProfitability == null) return 'No disponible';
  return formatMoney(activity.annualOperatingProfitability, activity.operatingCurrencyCode ?? 'ARS');
};
