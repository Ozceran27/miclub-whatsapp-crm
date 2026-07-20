import { formatEconomyDate, getMovementAmountLabel, getMovementTone } from './formatters';
import type { EconomyRecentMovement } from './types';

type Props = { movements: EconomyRecentMovement[] };

export function RecentMovementsPanel({ movements }: Props) {
  return (
    <article className="card home-kpi-card home-kpi-card--modern">
      <div className="home-card-heading"><h4>Últimos movimientos</h4><p>Ingresos y egresos recientes</p></div>
      <div className="finance-lines finance-lines--compact">
        {movements.length === 0 ? <p className="empty-card-note">No hay movimientos recientes.</p> : movements.map((movement) => (
          <span className={`finance-metric-row finance-metric-row--highlight-${getMovementTone(movement) === 'negativeCritical' ? 'red' : 'green'}`} key={movement.id}>
            <strong className="finance-metric-row__label">{movement.concept || movement.category || 'Movimiento'}<small> · {formatEconomyDate(movement.movementDate)}</small></strong>
            <span className="finance-metric-row__value">{getMovementAmountLabel(movement)}</span>
          </span>
        ))}
      </div>
    </article>
  );
}
