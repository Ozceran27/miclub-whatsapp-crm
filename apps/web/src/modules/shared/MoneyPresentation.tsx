import { formatMoney, type PresentationCurrencyCode } from '../../utils';

export type ExchangeQuote = { appliedRate: number|null; rateDate: string|null; source: string|null; convertedValue: number|null };
export const isQuoteStale = (date: string | null, now = Date.now(), maxAgeHours = 24) => !date || Number.isNaN(Date.parse(date)) || now - Date.parse(date) > maxAgeHours * 3_600_000;

export function MoneyPresentation({ usdNominal, presentationCurrencyCode, quote }: { usdNominal: number; presentationCurrencyCode: PresentationCurrencyCode; quote?: ExchangeQuote }) {
  const missing = !quote || quote.appliedRate === null || quote.rateDate === null || quote.source === null || quote.convertedValue === null;
  const stale = !missing && isQuoteStale(quote.rateDate);
  return <article className="money-presentation" aria-label="Saldo y conversión monetaria">
    <div><span>Saldo nominal</span><strong>{formatMoney(usdNominal, 'USD')}</strong></div>
    <div><span>Equivalente en {presentationCurrencyCode}</span><strong>{missing ? 'No disponible' : formatMoney(quote.convertedValue, presentationCurrencyCode)}</strong></div>
    {missing ? <p className="money-presentation__quote" data-tone="warning">Cotización faltante. El equivalente no se representa como cero.</p> : <p className="money-presentation__quote" data-tone={stale ? 'warning' : 'success'}>{stale ? 'Cotización vencida' : 'Cotización vigente'} · {new Date(quote.rateDate!).toLocaleString('es-AR')} · Fuente: {quote.source}</p>}
  </article>;
}
