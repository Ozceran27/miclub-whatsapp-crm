import type { HomeDashboardState } from './useHomeDashboard';

type ActivityBreakdownItem = HomeDashboardState['mainDebtorBreakdown'][number];
type Props = Pick<HomeDashboardState, 'enrollmentStats' | 'weightedAverageFeeLabel' | 'mainDebtorBreakdown' | 'remainingDebtorActivities' | 'totalDebtors' | 'maxDebtorActivityCount' | 'mainActiveActivityBreakdown' | 'remainingActiveActivities' | 'maxActiveActivityCount'>;

const renderActivityBreakdown = (items: ActivityBreakdownItem[], maxCount: number, emptyLabel: string, highlightFirst: false | 'featured' | 'warning' = false) => (
  items.length > 0 ? items.map((item, index) => {
    const isHighlighted = Boolean(highlightFirst) && index === 0;
    const highlightClass = highlightFirst === 'warning' ? 'activity-breakdown-item--warning' : 'activity-breakdown-item--highlight';
    const className = isHighlighted ? `activity-breakdown-item ${highlightClass}` : 'activity-breakdown-item';
    const marker = isHighlighted && highlightFirst === 'warning' ? '⚠ ' : '';
    const suffix = highlightFirst === 'featured' ? ' ⭐' : '';
    return <div className={className} key={item.activity}><div className="activity-breakdown-row"><span>{marker}{item.activity}{isHighlighted ? suffix : ''}</span><strong>{item.count}</strong></div><div className="activity-breakdown-track" aria-hidden="true"><span style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }} /></div></div>;
  }) : <p className="empty-card-note">{emptyLabel}</p>
);

export function RecentMovements({ enrollmentStats, weightedAverageFeeLabel, mainDebtorBreakdown, remainingDebtorActivities, totalDebtors, maxDebtorActivityCount, mainActiveActivityBreakdown, remainingActiveActivities, maxActiveActivityCount }: Props) {
  return (
    <div className="home-dashboard-row home-dashboard-row--primary">
      <article className="card home-kpi-card home-kpi-card--modern home-kpi-card--enrollment">
        <div className="home-card-heading"><h4>👥 Inscriptos</h4><p>Estados operativos actuales</p></div>
        <div className="enrollment-summary"><p className="home-kpi-value">{enrollmentStats.total}</p><span>Total de inscriptos</span></div>
        <div className="status-breakdown-grid">
          <span className="metric-row metric-row--highlight-green"><strong className="metric-row__label">Activos</strong><span className="metric-row__value">{enrollmentStats.active}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Al día</strong><span className="metric-row__value">{enrollmentStats.current}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Nuevos inscriptos</strong><span className="metric-row__value">{enrollmentStats.newEnrollment}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Adeudando</strong><span className="metric-row__value">{enrollmentStats.debtor}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Abandonados</strong><span className="metric-row__value">{enrollmentStats.abandoned}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Cancelados</strong><span className="metric-row__value">{enrollmentStats.cancelled}</span></span>
          <span className="metric-row"><strong className="metric-row__label">Cuota Promedio</strong><span className="metric-row__value">{weightedAverageFeeLabel}</span></span>
        </div>
        <div className="debtor-activity-panel"><div className="debtor-activity-panel__heading"><strong>Adeudados por actividad</strong><span>{totalDebtors} deudores</span></div><div className="activity-breakdown-list activity-breakdown-list--compact">{renderActivityBreakdown(mainDebtorBreakdown, maxDebtorActivityCount, 'Sin deudores registrados', 'warning')}{remainingDebtorActivities > 0 && <small>+ {remainingDebtorActivities} actividades</small>}</div></div>
      </article>
      <article className="card home-kpi-card home-kpi-card--modern home-kpi-card--activity">
        <div className="home-card-heading"><h4>🏷️ Inscriptos por actividad</h4><p>Solo inscriptos activos</p></div>
        <div className="activity-breakdown-list activity-breakdown-list--featured">{renderActivityBreakdown(mainActiveActivityBreakdown, maxActiveActivityCount, 'Sin actividades activas registradas', 'featured')}{remainingActiveActivities > 0 && <small>+ {remainingActiveActivities} actividades</small>}</div>
      </article>
    </div>
  );
}
