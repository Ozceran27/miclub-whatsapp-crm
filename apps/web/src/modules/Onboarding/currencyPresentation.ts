import { SUPPORTED_OPERATIONAL_CURRENCIES, type OperationalCurrency } from '@miclub/shared';

export interface CurrencyPresentation {
  code: OperationalCurrency;
  name: string;
  symbol: string;
  locale: string;
  flagRegion: 'AR' | 'US' | 'BR' | 'EU';
  flagName: string;
}

const presentationByCode = {
  ARS: { name: 'Peso argentino', symbol: '$', locale: 'es-AR', flagRegion: 'AR', flagName: 'Bandera de Argentina' },
  USD: { name: 'Dólar estadounidense', symbol: 'US$', locale: 'en-US', flagRegion: 'US', flagName: 'Bandera de Estados Unidos' },
  BRL: { name: 'Real brasileño', symbol: 'R$', locale: 'pt-BR', flagRegion: 'BR', flagName: 'Bandera de Brasil' },
  EUR: { name: 'Euro', symbol: '€', locale: 'es-ES', flagRegion: 'EU', flagName: 'Bandera de la Unión Europea' },
} as const satisfies Record<OperationalCurrency, Omit<CurrencyPresentation, 'code'>>;

/** Presentation order always comes from the shared contract's canonical list. */
export const CURRENCY_PRESENTATIONS: readonly CurrencyPresentation[] =
  SUPPORTED_OPERATIONAL_CURRENCIES.map(code => ({ code, ...presentationByCode[code] }));

export const getCurrencyPresentation = (code: string): CurrencyPresentation | undefined =>
  CURRENCY_PRESENTATIONS.find(currency => currency.code === code);

export const formatCurrencyLabel = (code: string): string => {
  const currency = getCurrencyPresentation(code);
  return currency ? `${currency.name} (${currency.code})` : `Moneda desconocida (${code || '—'})`;
};

export const getCurrencyPrefix = (code: string): string =>
  getCurrencyPresentation(code)?.symbol ?? (code || '—');

export const formatOnboardingMoney = (value: number, code: string): string => {
  const currency = getCurrencyPresentation(code);
  if (!currency) return `${getCurrencyPrefix(code)} ${value.toLocaleString('es-AR')}`;
  return new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code }).format(value);
};

export function getCurrencyAfterKey(currentCode: string, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): OperationalCurrency {
  const current = CURRENCY_PRESENTATIONS.findIndex(currency => currency.code === currentCode);
  if (key === 'Home') return CURRENCY_PRESENTATIONS[0].code;
  if (key === 'End') return CURRENCY_PRESENTATIONS.at(-1)!.code;
  const start = current < 0 ? 0 : current;
  const offset = key === 'ArrowDown' ? 1 : -1;
  return CURRENCY_PRESENTATIONS[(start + offset + CURRENCY_PRESENTATIONS.length) % CURRENCY_PRESENTATIONS.length].code;
}
