import { EconomyComparisonCards } from './Economy/EconomyComparisonCards';
import { EconomyInsights } from './Economy/EconomyInsights';
import { EconomyMonthlyChart } from './Economy/EconomyMonthlyChart';
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

      {dashboard.status === 'loading' && <div className="card"><p>Cargando economía…</p></div>}
      {dashboard.status === 'error' && <div className="card error-card"><strong>No se pudo cargar Economía Club.</strong><p>{dashboard.error?.message}</p></div>}
      {dashboard.status === 'empty' && <div className="card"><strong>Sin datos económicos.</strong><p>Cuando se registren movimientos, el tablero mostrará ingresos, egresos y pendientes.</p></div>}

      {data && dashboard.status === 'ready' && (
        <section className="home-dashboard-stack" aria-label="Tablero económico del club">
          <EconomySummaryCards summary={data.summary} />
          <EconomyComparisonCards comparison={data.comparison} />
          <EconomyInsights insights={data.insights.items} />
          <div className="economy-charts-grid">
            <EconomyMonthlyChart monthlyEvolution={data.monthlyEvolution} />
            <EconomyProfitChart monthlyEvolution={data.monthlyEvolution} />
          </div>
          <EconomyRankings bySector={data.bySector} byCategory={data.byCategory} />
          <EconomyPaymentMethodsChart paymentMethods={data.paymentMethods} />
          <div className="home-dashboard-row home-dashboard-row--primary">
            <RecentMovementsPanel movements={data.recentMovements.items} />
            <PendingMovementsPanel pending={data.pending} />
          </div>
        </section>
      )}
    </main>
  );
}
