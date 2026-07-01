import { formatEconomyDate, formatEconomyMoney, getMovementAmountLabel } from './formatters';
import type { EconomyPendingSummary } from './types';

type Props = { pending: EconomyPendingSummary };

export function PendingMovementsPanel({ pending }: Props) {
  return (
    <article className="card home-kpi-card home-kpi-card--modern home-kpi-card--enrollment">
      <div className="home-card-heading"><h4>Pendientes</h4><p>Movimientos financieros u operativos sin cerrar</p></div>
      <div className="status-breakdown-grid">
        <span className="metric-row metric-row--highlight-green"><strong className="metric-row__label">A cobrar</strong><span className="metric-row__value">{formatEconomyMoney(pending.pendingIncome)}</span></span>
        <span className="metric-row"><strong className="metric-row__label">A pagar</strong><span className="metric-row__value">{formatEconomyMoney(pending.pendingExpenses)}</span></span>
        <span className="metric-row"><strong className="metric-row__label">Balance</strong><span className="metric-row__value">{formatEconomyMoney(pending.pendingBalance)}</span></span>
        <span className="metric-row"><strong className="metric-row__label">Cantidad</strong><span className="metric-row__value">{pending.pendingMovements}</span></span>
      </div>
      <div className="finance-lines finance-lines--compact">
        {pending.items.length === 0 ? <p className="empty-card-note">No hay pendientes registrados.</p> : pending.items.map((movement) => (
          <span className="finance-metric-row" key={movement.id}>
            <strong className="finance-metric-row__label">{movement.concept || movement.category || 'Pendiente'}<small> · {formatEconomyDate(movement.movementDate)}</small></strong>
            <span className="finance-metric-row__value">{getMovementAmountLabel(movement)}</span>
          </span>
        ))}
      </div>
    </article>
  );
}
