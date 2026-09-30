import { useState, type ReactNode } from 'react';
import { useSession } from '../session';
import { EconomyDashboardState } from './Economy/EconomyDashboardState';
import { EconomyInsights } from './Economy/EconomyInsights';
import { EconomyGrowthChart } from './Economy/EconomyGrowthChart';
import { EconomyMonthlyChart } from './Economy/EconomyMonthlyChart';
import { EconomyMonthlySummaryPanel } from './Economy/EconomyMonthlySummaryPanel';
import { EconomyOperatingProfitabilityChart } from './Economy/EconomyOperatingProfitabilityChart';
import { EconomyPaymentMethodsChart } from './Economy/EconomyPaymentMethodsChart';
import { EconomyProfitChart } from './Economy/EconomyProfitChart';
import { EconomyRankings } from './Economy/EconomyRankings';
import { EconomySummaryCards } from './Economy/EconomySummaryCards';
import { EconomyYearlyBreakdownCharts } from './Economy/EconomyYearlyBreakdownCharts';
import { PendingMovementsPanel } from './Economy/PendingMovementsPanel';
import { RecentMovementsPanel } from './Economy/RecentMovementsPanel';
import { useEconomyDashboard } from './Economy/useEconomyDashboard';
import { FinancialCircuitPanel } from './Finance/FinancialCircuitPanel';

type Resource<T> = { data?: T; error?: unknown; loading: boolean; refetch: () => Promise<T> };
function Section<T>({ title, resource, children }: { title: string; resource: Resource<T>; children: (data: T) => ReactNode }) {
  if (resource.error) return <EconomyDashboardState type="error" title={`No se pudo cargar ${title}`} message={resource.error instanceof Error ? resource.error.message : 'Error al consultar esta sección.'} actionLabel="Reintentar" onAction={() => void resource.refetch().catch(() => undefined)} />;
  if (!resource.data) return <p className="economy-section-loading" role="status">Cargando {title}…</p>;
  return <>{children(resource.data)}</>;
}

export default function EconomyModule() {
  const { clubId } = useSession();
  const [selection, setSelection] = useState(() => ({ clubId, year: new Date().getFullYear() }));
  const year = selection.clubId === clubId ? selection.year : new Date().getFullYear();
  const dashboard = useEconomyDashboard(year);
  const s = dashboard.sections;
  const years = s.availableYears.data?.items ?? [year];

  return <main className="module-content">
    <section className="module-hero home-hero economy-module-hero">
      <div className="home-hero__copy"><p className="eyebrow">Tesorería</p><h2>Tablero de Tesorería</h2><p>Resumen financiero, movimientos recientes y pendientes operativos.</p></div>
      <div className="home-sync-badges economy-module-actions" aria-label="Acciones de Tesorería">
        <label className="economy-year-control">Año <select aria-label="Año del resumen histórico" value={year} onChange={event => setSelection({ clubId, year: Number(event.target.value) })}>{years.includes(year) ? null : <option value={year}>{year}</option>}{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="icon-btn home-sync-button" onClick={dashboard.loadEconomyDashboard}>Actualizar</button>
      </div>
    </section>
    {dashboard.isEmpty && <EconomyDashboardState type="empty" title="Sin datos económicos" message="Cuando se registren movimientos en PostgreSQL, el tablero mostrará ingresos, egresos y pendientes." />}
    <section className="home-dashboard-stack" aria-label="Tablero económico del club">
      <Section title="indicadores del mes" resource={s.summary}>{summary => <>
        <EconomySummaryCards summary={summary} comparison={s.comparison.data ?? { currentPeriod: '', previousPeriod: '', items: [], total: 0 }} />
        {s.comparison.error && <EconomyDashboardState type="error" title="No se pudieron cargar las comparaciones" message={s.comparison.error instanceof Error ? s.comparison.error.message : 'Error al consultar las comparaciones.'} actionLabel="Reintentar" onAction={() => void s.comparison.refetch().catch(() => undefined)} />}
      </>}</Section>
      <FinancialCircuitPanel summaryOnly hidePrimaryTotals />
      <div className="economy-lower-grid">
        <Section title="insights" resource={s.insights}>{data => <EconomyInsights insights={data.items} />}</Section>
        <Section title="resumen mensual" resource={s.monthlyEvolution}>{data => <EconomyMonthlySummaryPanel monthlyEvolution={data} year={year} currencyCode={s.summary.data?.currencyCode} />}</Section>
      </div>
      <Section title="gráficos mensuales" resource={s.monthlyEvolution}>{data => <div className="economy-charts-grid"><EconomyMonthlyChart monthlyEvolution={data} /><EconomyProfitChart monthlyEvolution={data} /><EconomyGrowthChart monthlyEvolution={data} /><EconomyOperatingProfitabilityChart monthlyEvolution={data} /></div>}</Section>
      <Section title="desglose interanual" resource={s.yearlyBreakdown}>{data => <EconomyYearlyBreakdownCharts yearlyBreakdown={data} />}</Section>
      <Section title="medios de pago" resource={s.paymentMethods}>{data => <EconomyPaymentMethodsChart paymentMethods={data} />}</Section>
      <Section title="ranking sectorial" resource={s.sectorRankings}>{sectorRankings => <>
        <EconomyRankings sectorRankings={sectorRankings} byCategory={s.byCategory.data} currencyCode={s.summary.data?.currencyCode} />
        {s.byCategory.error && <EconomyDashboardState type="error" title="No se pudo cargar el ranking por categoría" message={s.byCategory.error instanceof Error ? s.byCategory.error.message : 'Error al consultar categorías.'} actionLabel="Reintentar" onAction={() => void s.byCategory.refetch().catch(() => undefined)} />}
      </>}</Section>
      <div className="economy-final-grid">
        <Section title="pendientes" resource={s.pending}>{data => <PendingMovementsPanel pending={data} />}</Section>
        <Section title="movimientos recientes" resource={s.recentMovements}>{data => <RecentMovementsPanel movements={data.items} />}</Section>
      </div>
    </section>
  </main>;
}
