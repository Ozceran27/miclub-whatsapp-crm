import type { AdministrationActivityDto } from '@miclub/shared';

const frequencies = { DAILY: 'diario', WEEKLY: 'semanal', MONTHLY: 'mensual', YEARLY: 'anual' } as const;

export function describeActivityTerms(activity: AdministrationActivityDto): string {
  const mode = activity.settlementMode?.toUpperCase();
  if (mode === 'FIXED') {
    const currency = activity.currencyCode ?? 'ARS';
    const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(activity.settlementFixedAmount ?? 0);
    return `Fijo ${amount} ${activity.fixedFeeFrequency ? frequencies[activity.fixedFeeFrequency] : 'por período'}`;
  }
  if (mode === 'VARIABLE') return `Variable ${activity.clubSharePercentage ?? activity.clubCommissionPercent}% para el club`;
  return 'Sin términos vigentes';
}
