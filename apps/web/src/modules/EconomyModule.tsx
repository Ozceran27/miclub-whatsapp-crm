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
import { PendingMovementsPanel } from './Economy/PendingMovementsPanel';
import { RecentMovementsPanel } from './Economy/RecentMovementsPanel';
import { useEconomyDashboard } from './Economy/useEconomyDashboard';

export default function EconomyModule() {
  const dashboard = useEconomyDashboard();
  const data = dashboard.data;

  return (
    <main className="module-content">
      <section className="module-hero home-hero economy-module-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Economía Club</p>
          <h2>Tablero económico del club</h2>
          <p>Resumen financiero, movimientos recientes y pendientes operativos.</p>
        </div>
        <div className="home-sync-badges economy-module-actions" aria-label="Acciones de economía">
          <span className="home-sync-badge hero-sync-badge--compact home-sync-badge--muted">/api/economy</span>
          <button className="icon-btn home-sync-button" onClick={() => void dashboard.loadEconomyDashboard()} disabled={dashboard.loading}>{dashboard.loading ? 'Actualizando…' : 'Actualizar'}</button>
        </div>
      </section>

      {dashboard.status === 'loading' && (
        <EconomyDashboardState type="loading" title="Cargando Economía Club" message="Consultando PostgreSQL y preparando indicadores, gráficos y movimientos." />
      )}
      {dashboard.status === 'error' && (
        <EconomyDashboardState
          type="error"
          title="No se pudo cargar Economía Club"
          message={dashboard.error?.message ?? 'Error desconocido al consultar los datos económicos.'}
          actionLabel="Reintentar"
          onAction={() => void dashboard.loadEconomyDashboard()}
          isActionDisabled={dashboard.loading}
        />
      )}
      {dashboard.status === 'empty' && (
        <EconomyDashboardState
          type="empty"
          title="Sin datos económicos"
          message="Cuando se registren movimientos en PostgreSQL, el tablero mostrará ingresos, egresos y pendientes."
          actionLabel="Actualizar"
          onAction={() => void dashboard.loadEconomyDashboard()}
          isActionDisabled={dashboard.loading}
        />
      )}

      {data && dashboard.status === 'ready' && (
        <section className="home-dashboard-stack" aria-label="Tablero económico del club">
          <EconomySummaryCards summary={data.summary} comparison={data.comparison} />
          <div className="economy-lower-grid">
            <EconomyInsights insights={data.insights.items} />
            <EconomyMonthlySummaryPanel monthlyEvolution={data.monthlyEvolution} />
          </div>
          <div className="economy-charts-grid">
            <EconomyMonthlyChart monthlyEvolution={data.monthlyEvolution} />
            <EconomyProfitChart monthlyEvolution={data.monthlyEvolution} />
            <EconomyGrowthChart monthlyEvolution={data.monthlyEvolution} />
            <EconomyOperatingProfitabilityChart monthlyEvolution={data.monthlyEvolution} />
          </div>
          <EconomyRankings sectorRankings={data.sectorRankings} />
          <EconomyPaymentMethodsChart paymentMethods={data.paymentMethods} />
          <div className="economy-final-grid">
            <PendingMovementsPanel pending={data.pending} />
            <RecentMovementsPanel movements={data.recentMovements.items} />
          </div>
        </section>
      )}
    </main>
  );
}
