import type { EconomyInsight } from './types';

type Props = { insights: EconomyInsight[] };

const iconByType: Record<string, string> = { positive: '✅', warning: '⚠️', info: 'ℹ️' };

export function EconomyInsights({ insights }: Props) {
  return (
    <article className="card home-kpi-card finance-card economy-insights-panel">
      <div className="home-card-heading finance-card__header"><h4>Insights automáticos</h4><p>Lectura basada en movimientos y saldos reales</p></div>
      {insights.length > 0 ? (
        <ul className="economy-insights-list">
          {insights.map((insight) => (
            <li className={`economy-insights-list__item economy-insights-list__item--${insight.type}`} key={insight.key}>
              <span aria-hidden="true">{iconByType[insight.type] ?? '•'}</span>
              <strong>{insight.message}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="economy-chart-empty">Sin insights disponibles.</p>}
    </article>
  );
}
