import { formatEconomyMoney } from './formatters';
import type { EconomyComparison, EconomyComparisonMetric, EconomySummary } from './types';

type Props = { summary: EconomySummary; comparison: EconomyComparison };

const formatVariation = (item?: EconomyComparisonMetric) => {
  if (!item) return '—';
  if (item.comparable === false || item.available === false) return 'Sin base comparable';
  const value = item.percentageChange ?? item.variation;
  return typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Sin base comparable';
};

const tone = (kind: 'positive' | 'negative' | 'neutral') => kind === 'positive' ? 'finance-card--income' : kind === 'negative' ? 'finance-card--expense' : 'finance-card--summary';
const variationTone = (item?: EconomyComparisonMetric) => item?.impact === 'favorable' ? 'finance-card--income' : item?.impact === 'unfavorable' ? 'finance-card--expense' : 'finance-card--summary';

export function EconomySummaryCards({ summary, comparison }: Props) {
  const monthLabel = summary.month?.label ?? 'actual';
  const find = (key: string) => comparison.items.find((item) => item.key === key);
  const monthlyBalanceTone = summary.balance > 0 ? 'positive' : summary.balance < 0 ? 'negative' : 'neutral';
  const cards = [
    { label: `Ingresos mes de ${monthLabel}`, subtitle: 'Economía Club', value: formatEconomyMoney(summary.income), className: 'finance-card--income' },
    { label: `Egresos mes de ${monthLabel}`, subtitle: 'Economía Club', value: formatEconomyMoney(summary.expenses), className: 'finance-card--expense' },
    { label: `Balance mes de ${monthLabel}`, subtitle: 'Economía Club', value: formatEconomyMoney(summary.balance), className: tone(monthlyBalanceTone) },
    { label: 'Liquidez actual', subtitle: 'Fuente INICIO', value: formatEconomyMoney(summary.liquidity ?? summary.current?.liquidity), className: 'finance-card--income' },
    { label: 'Saldo Proyectado', subtitle: 'Fuente INICIO', value: formatEconomyMoney(summary.projectedBalance ?? summary.current?.projectedBalance), className: 'finance-card--balance' },
    { label: 'Variación de Ingresos', subtitle: 'Últimos 30 días', value: formatVariation(find('income')), className: variationTone(find('income')), detail: `Actual ${formatEconomyMoney(find('income')?.current)}` },
    { label: 'Variación de Egresos', subtitle: 'Últimos 30 días', value: formatVariation(find('expenses')), className: variationTone(find('expenses')), detail: `Actual ${formatEconomyMoney(find('expenses')?.current)}` },
    { label: 'Variación de Utilidad', subtitle: 'Últimos 30 días', value: formatVariation(find('utility')), className: variationTone(find('utility')), detail: `Actual ${formatEconomyMoney(find('utility')?.current)}` },
    { label: 'Variación de Liquidez', subtitle: 'Últimos 30 días', value: formatVariation(find('liquidity')), className: variationTone(find('liquidity')), detail: find('liquidity')?.available === false ? 'Sin historial suficiente' : `Actual ${formatEconomyMoney(find('liquidity')?.current)}` },
    { label: 'Rentabilidad Operativa', subtitle: 'Variación últimos 30 días', value: formatVariation(find('operatingProfitability')), className: variationTone(find('operatingProfitability')), detail: `Actual ${formatEconomyMoney(find('operatingProfitability')?.current)}` },
  ];

  return (
    <div className="economy-kpi-strip" aria-label="Resumen analítico de Economía Club">
      {cards.map((card) => (
        <article className={`card home-kpi-card home-kpi-card--compact finance-card economy-top-card ${card.className}`} key={card.label}>
          <div className="home-card-heading finance-card__header"><h4>{card.label}</h4><p>{card.subtitle}</p></div>
          <p className="home-kpi-value economy-top-card__value">{card.value}</p>
          {card.detail && <p className="economy-top-card__detail">{card.detail}</p>}
        </article>
      ))}
    </div>
  );
}
