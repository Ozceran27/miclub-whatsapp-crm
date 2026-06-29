import type { ModuleId } from './ModuleNav';
import { HomeAlerts } from './Home/HomeAlerts';
import { HomeMetricCards } from './Home/HomeMetricCards';
import { RecentMovements } from './Home/RecentMovements';
import { SectorDistribution } from './Home/SectorDistribution';
import { useHomeDashboard } from './Home/useHomeDashboard';

type HomeModuleProps = {
  onOpenModule: (moduleId: ModuleId) => void;
};

export default function HomeModule({ onOpenModule }: HomeModuleProps) {
  const dashboard = useHomeDashboard();

  return (
    <main className="module-content">
      <section className="module-hero home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Inicio</p>
          <h2>Panel operativo de miClub</h2>
          <p>Resumen ejecutivo e indicadores generales.</p>
        </div>
        <div className="home-sync-badges" aria-label="Sincronización del inicio">
          <span
            className={dashboard.syncStatus?.error ? 'home-sync-badge hero-sync-badge--compact home-sync-badge--warning' : 'home-sync-badge hero-sync-badge--compact'}
            title={dashboard.syncStatus?.error}
          >
            {dashboard.syncBadgeLabel}
          </span>
          <span className="home-sync-badge hero-sync-badge--compact home-sync-badge--muted">{dashboard.lastSyncLabel}</span>
          <button className="icon-btn home-sync-button" onClick={() => void dashboard.loadHome()} disabled={dashboard.loading}>Sincronizar</button>
        </div>
      </section>

      <HomeAlerts error={dashboard.error} loading={dashboard.loading} />

      <section className="home-dashboard-stack" aria-label="Resumen operativo del club">
        <HomeMetricCards
          financialSummaryLines={dashboard.financialSummaryLines}
          operationalBalanceLines={dashboard.operationalBalanceLines}
          incomeBySectorLines={dashboard.incomeBySectorLines}
          expenseBySectorLines={dashboard.expenseBySectorLines}
          financeError={dashboard.financeError}
          financeSummary={dashboard.financeSummary}
        />
        <RecentMovements
          enrollmentStats={dashboard.enrollmentStats}
          weightedAverageFeeLabel={dashboard.weightedAverageFeeLabel}
          mainDebtorBreakdown={dashboard.mainDebtorBreakdown}
          remainingDebtorActivities={dashboard.remainingDebtorActivities}
          totalDebtors={dashboard.totalDebtors}
          maxDebtorActivityCount={dashboard.maxDebtorActivityCount}
          mainActiveActivityBreakdown={dashboard.mainActiveActivityBreakdown}
          remainingActiveActivities={dashboard.remainingActiveActivities}
          maxActiveActivityCount={dashboard.maxActiveActivityCount}
        />
      </section>

      <SectorDistribution
        sectorError={dashboard.sectorError}
        sectorCards={dashboard.sectorCards}
        loadHome={dashboard.loadHome}
        onOpenModule={onOpenModule}
      />
    </main>
  );
}
