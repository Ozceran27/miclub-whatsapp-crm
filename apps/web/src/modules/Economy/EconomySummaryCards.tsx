import { formatEconomyMoney } from './formatters';
import type { EconomySummary } from './types';

type Props = { summary: EconomySummary };

export function EconomySummaryCards({ summary }: Props) {
  const cards = [
    { label: 'Ingresos del mes', value: formatEconomyMoney(summary.income), className: 'finance-card--income' },
    { label: 'Egresos del mes', value: formatEconomyMoney(summary.expenses), className: 'finance-card--expense' },
    { label: 'Balance mensual', value: formatEconomyMoney(summary.balance), className: 'finance-card--balance' },
    { label: 'Saldo pendiente', value: formatEconomyMoney(summary.pendingBalance), className: 'finance-card--summary' }
  ];

  return (
    <div className="home-dashboard-row home-dashboard-row--secondary">
      {cards.map((card) => (
        <article className={`card home-kpi-card home-kpi-card--compact finance-card ${card.className}`} key={card.label}>
          <div className="home-card-heading finance-card__header"><h4>{card.label}</h4><p>Economía Club</p></div>
          <p className="home-kpi-value">{card.value}</p>
        </article>
      ))}
      <article className="card home-kpi-card home-kpi-card--compact finance-card">
        <div className="home-card-heading finance-card__header"><h4>Movimientos</h4><p>Completados / totales</p></div>
        <p className="home-kpi-value">{summary.completedMovements} / {summary.totalMovements}</p>
      </article>
    </div>
  );
}
