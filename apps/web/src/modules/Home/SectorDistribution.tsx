import type { ModuleId } from '../ModuleNav';
import type { HomeDashboardState } from './useHomeDashboard';

type Props = Pick<HomeDashboardState, 'sectorError' | 'sectorCards' | 'loadHome'> & {
  onOpenModule: (moduleId: ModuleId) => void;
};

export function SectorDistribution({ sectorError, sectorCards, loadHome, onOpenModule }: Props) {
  return (
    <section className="section-panel">
      <div className="section-header">
        <div>
          <h3>Distribución operativa por sector</h3>
          <p>Resumen operativo real por sector con datos de gestión general.</p>
        </div>
        <button className="icon-btn ghost-btn" onClick={() => void loadHome()}>Actualizar inicio</button>
      </div>
      {sectorError && <small className="integration-note">{sectorError}</small>}
      <div className="area-grid">
        {sectorCards.map((area) => (
          <article key={area.key} className={`area-card area-card--${area.accent}`}>
            <div className="area-card__topline" aria-hidden="true" />
            <div className="area-card__heading">
              <span className="area-card__icon" aria-hidden="true">{area.icon}</span>
              <div className="area-card__title-block"><h4>{area.title}</h4><p>{area.subtitle}</p></div>
              <button className="area-card__module-link" onClick={() => onOpenModule(area.moduleId)}>Ver módulo</button>
            </div>
            <div className="area-card__primary-metric"><span>{area.mainMetric.label}</span><strong title={area.mainMetric.title}>{area.mainMetric.value}</strong></div>
            <dl className="area-card__metrics">
              {area.secondaryMetrics.map((metric) => (
                <div className={`area-card__metric${metric.className ? ` ${metric.className}` : ''}`} key={metric.label}>
                  <dt>{metric.label}</dt><dd title={metric.title}>{metric.value}</dd>
                </div>
              ))}
            </dl>
            {area.featuredMetric && <div className="area-card__featured-metric"><span>{area.featuredMetric.label}</span><strong title={area.featuredMetric.title}>{area.featuredMetric.value}</strong>{area.featuredMetric.detail && <small>{area.featuredMetric.detail}</small>}</div>}
          </article>
        ))}
      </div>
    </section>
  );
}
