import { formatEconomyMoney } from './formatters';
import type { EconomyComparison, EconomyComparisonMetric, EconomySummary } from './types';

type Props = { summary: EconomySummary; comparison: EconomyComparison };

type TopCardVariant = 'positive' | 'negative' | 'utility' | 'projected';

type TopCard = {
  label: string;
  icon: string;
  subtitle: string;
  value: string;
  variant: TopCardVariant;
  detail?: string;
  metric?: EconomyComparisonMetric;
};

const formatVariation = (item?: EconomyComparisonMetric) => {
  if (!item) return '—';
  if (item.comparable === false || item.available === false) return 'Sin historial suficiente';
  const value = item.percentageChange ?? item.variation;
  return typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Sin base comparable';
};

const variationState = (item?: EconomyComparisonMetric) => item?.impact === 'favorable' ? 'favorable' : item?.impact === 'unfavorable' ? 'unfavorable' : 'neutral';

export function EconomySummaryCards({ summary, comparison }: Props) {
  const monthLabel = summary.month?.label ?? 'actual';
  const find = (key: string) => comparison.items.find((item) => item.key === key);
  const operatingProfitability = find('operatingProfitability');
  const cards: TopCard[] = [
    { label: `Ingresos mes de ${monthLabel}`, icon: '📈', subtitle: 'Economía Club', value: formatEconomyMoney(summary.income), variant: 'positive' },
    { label: `Egresos mes de ${monthLabel}`, icon: '📉', subtitle: 'Economía Club', value: formatEconomyMoney(summary.expenses), variant: 'negative' },
    { label: `Balance mes de ${monthLabel}`, icon: '⚖️', subtitle: 'Economía Club', value: formatEconomyMoney(summary.balance), variant: 'utility' },
    { label: 'Liquidez actual', icon: '💰', subtitle: 'Fuente INICIO', value: formatEconomyMoney(summary.liquidity ?? summary.current?.liquidity), variant: 'positive' },
    { label: 'Saldo Proyectado', icon: '📊', subtitle: 'Fuente INICIO', value: formatEconomyMoney(summary.projectedBalance ?? summary.current?.projectedBalance), variant: 'projected' },
    { label: 'Variación de Ingresos', icon: '↗️', subtitle: comparison.currentPeriod || 'Últimos 30 días', value: formatVariation(find('income')), variant: 'positive' },
    { label: 'Variación de Egresos', icon: '↘️', subtitle: comparison.currentPeriod || 'Últimos 30 días', value: formatVariation(find('expenses')), variant: 'negative' },
    { label: 'Variación de Utilidad', icon: '🔰', subtitle: comparison.currentPeriod || 'Últimos 30 días', value: formatVariation(find('utility')), variant: 'utility' },
    { label: 'Crecimiento', icon: '🌱', subtitle: 'Últimos dos meses completos', value: formatVariation(find('growth')), variant: 'positive', metric: find('growth') },
    { label: 'Rentabilidad Operativa', icon: '⚙️', subtitle: 'Últimos 30 días', value: formatEconomyMoney(operatingProfitability?.current), variant: 'projected', detail: `Variación: ${formatVariation(operatingProfitability)}`, metric: operatingProfitability },
  ];

  return (
    <div className="economy-kpi-strip" aria-label="Resumen analítico de Economía Club">
      {cards.map((card) => (
        <article className={`card home-kpi-card home-kpi-card--compact finance-card economy-top-card economy-top-card--${card.variant}`} key={card.label}>
          <div className="home-card-heading finance-card__header">
            <h4><span className="economy-top-card__icon" aria-hidden="true">{card.icon}</span><span>{card.label}</span></h4>
            <p>{card.subtitle}</p>
          </div>
          <p className={`economy-top-card__value economy-top-card__value--${variationState(card.metric)}`}>{card.value}</p>
          {card.detail && <p className="economy-top-card__detail">{card.detail}</p>}
        </article>
      ))}
    </div>
  );
}
