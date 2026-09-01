export type PresentationCurrencyCode = 'ARS' | 'USD' | 'BRL' | 'EUR';

const currencyLocales: Record<PresentationCurrencyCode, string> = {
  ARS: 'es-AR', USD: 'en-US', BRL: 'pt-BR', EUR: 'es-ES'
};

/** Every monetary call must declare its presentation currency; locale never selects it. */
export const formatMoney = (
  amount: number | null | undefined,
  presentationCurrencyCode: PresentationCurrencyCode,
): string => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(currencyLocales[presentationCurrencyCode], {
    style: 'currency', currency: presentationCurrencyCode, maximumFractionDigits: 2
  }).format(amount);
};

/** @deprecated Prefer formatMoney and provide the currency explicitly. */
export const formatArPeso = (amount: number | undefined | null): string => formatMoney(amount, 'ARS');
