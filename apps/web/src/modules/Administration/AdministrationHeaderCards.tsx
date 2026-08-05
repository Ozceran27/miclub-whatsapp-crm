import type { AdministrationMetricComparison, AdministrationSummaryResponse } from '@miclub/shared';

type Props = { summary: AdministrationSummaryResponse };
type Variant = 'positive' | 'negative' | 'utility' | 'projected';

type Card = {
  label: string;
  icon: string;
  subtitle: string;
  value: string;
  detail?: string;
  variant: Variant;
  comparison?: AdministrationMetricComparison | null;
};

const formatInteger = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-AR').format(value) : '—';
const formatPercent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';

const formatVariation = (comparison?: AdministrationMetricComparison | null) => {
  if (!comparison) return 'Sin historial suficiente';
  if (comparison.comparable === false || typeof comparison.percentageChange !== 'number' || !Number.isFinite(comparison.percentageChange)) return 'Sin base comparable';
  return `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange.toFixed(1)}% vs mes anterior`;
};

const variationState = (comparison?: AdministrationMetricComparison | null) => {
  if (!comparison?.direction || comparison.direction === 'none' || comparison.direction === 'stable') return 'neutral';
  return comparison.direction === 'up' ? 'favorable' : 'unfavorable';
};

const summarizeActivities = (summary: AdministrationSummaryResponse) => {
  const activities = summary.rankings?.activitiesByEnrollments?.slice(0, 3) ?? [];
  if (activities.length === 0) return 'Sin ranking disponible';
  return activities.map((activity) => `${activity.label} (${formatInteger(activity.value)})`).join(' · ');
};

export function AdministrationHeaderCards({ summary }: Props) {
  const enrollmentsComparison = summary.totals?.enrollments?.comparison;
  const growthPoint = summary.trends?.points?.at(-1);
  const cards: Card[] = [
    {
      label: 'Inscriptos',
      icon: '👥',
      subtitle: 'Inscripciones activas',
      value: formatInteger(summary.totals?.enrollments?.value),
      detail: formatVariation(enrollmentsComparison),
      variant: 'positive',
      comparison: enrollmentsComparison
    },
    {
      label: 'Capacidad operativa',
      icon: '🏟️',
      subtitle: summary.capacity ? `${formatInteger(summary.capacity.occupied)} ocupados / ${formatInteger(summary.capacity.totalCapacity)} cupos` : 'Cupos operativos',
      value: formatPercent(summary.capacity?.occupancyRate),
      detail: summary.capacity ? `${formatInteger(summary.capacity.available)} disponibles` : 'Sin capacidad configurada',
      variant: 'projected'
    },
    {
      label: 'Trabajadores y roles',
      icon: '🧑‍💼',
      subtitle: `${formatInteger(summary.totals?.workers?.value)} trabajadores`,
      value: formatInteger(summary.cards?.find((card) => card.id === 'roles')?.value),
      detail: 'roles activos configurados',
      variant: 'utility'
    },
    {
      label: 'Actividades principales',
      icon: '⭐',
      subtitle: `${formatInteger(summary.totals?.activities?.value)} actividades activas`,
      value: formatInteger(summary.rankings?.activitiesByEnrollments?.[0]?.value),
      detail: summarizeActivities(summary),
      variant: 'positive'
    },
    {
      label: 'Crecimiento',
      icon: '🌱',
      subtitle: growthPoint?.period ? `Período ${growthPoint.period}` : 'Último mes completo',
      value: formatInteger(growthPoint?.enrollments),
      detail: formatVariation(enrollmentsComparison),
      variant: 'projected',
      comparison: enrollmentsComparison
    }
  ];

  return (
    <div className="economy-kpi-strip administration-header-cards" aria-label="Resumen inicial de Administración">
      {cards.map((card) => (
        <article className={`card home-kpi-card home-kpi-card--compact finance-card economy-top-card economy-top-card--${card.variant} administration-header-card`} key={card.label}>
          <div className="home-card-heading finance-card__header economy-top-card__header">
            <div className="economy-top-card__title-row">
              <h4><span className="economy-top-card__icon" aria-hidden="true">{card.icon}</span><span>{card.label}</span></h4>
            </div>
            <p className="economy-top-card__subtitle">{card.subtitle}</p>
          </div>
          <div className="economy-top-card__value-row">
            <p className={`economy-top-card__value economy-top-card__value--${variationState(card.comparison)}`}>{card.value}</p>
          </div>
          <p className={`economy-top-card__detail economy-top-card__detail--${variationState(card.comparison)}`}>{card.detail}</p>
        </article>
      ))}
    </div>
  );
}
