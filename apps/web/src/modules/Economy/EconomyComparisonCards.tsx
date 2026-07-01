import { formatEconomyMoney } from './formatters';
import type { EconomyComparison } from './types';

type Props = { comparison: EconomyComparison };

const formatVariation = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Sin base');

const getTone = (key: string, direction: string) => {
  if (direction === 'flat' || direction === 'none') return 'finance-card--summary';
  if (key === 'expenses') return direction === 'down' ? 'finance-card--income' : 'finance-card--expense';
  return direction === 'up' ? 'finance-card--income' : 'finance-card--expense';
};

export function EconomyComparisonCards({ comparison }: Props) {
  return (
    <section className="economy-comparison-section" aria-label="Comparación mensual económica">
      <div className="home-card-heading economy-comparison-section__heading">
        <h4>Comparación mensual</h4>
        <p>{comparison.previousPeriod || 'Mes anterior'} vs {comparison.currentPeriod || 'mes actual'}</p>
      </div>
      <div className="home-dashboard-row home-dashboard-row--secondary">
        {comparison.items.filter((item) => item.applies).map((item) => (
          <article className={`card home-kpi-card home-kpi-card--compact finance-card economy-comparison-card ${getTone(item.key, item.direction)}`} key={item.key}>
            <div className="home-card-heading finance-card__header"><h4>{item.label}</h4><p>Actual {formatEconomyMoney(item.current)} · anterior {formatEconomyMoney(item.previous)}</p></div>
            <p className="home-kpi-value">{formatVariation(item.variation)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
