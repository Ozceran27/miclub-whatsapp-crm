import { AdministrationActions } from './Administration/AdministrationActions';
import { AdministrationHeaderCards } from './Administration/AdministrationHeaderCards';
import { useAdministrationSummary } from './Administration/useAdministrationSummary';
import { EconomyDashboardState } from './Economy/EconomyDashboardState';

export default function AdministrationModule() {
  const dashboard = useAdministrationSummary();

  return (
    <main className="module-content">
      <section className="module-hero home-hero economy-module-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Administración</p>
          <h2>Panel inicial de Administración</h2>
          <p>Resumen operativo de inscripciones, capacidad, equipo, actividades y crecimiento.</p>
        </div>
        <div className="home-sync-badges economy-module-actions" aria-label="Acciones de administración">
          <button className="icon-btn home-sync-button" onClick={() => void dashboard.loadAdministrationSummary()} disabled={dashboard.loading}>{dashboard.loading ? 'Actualizando…' : 'Actualizar'}</button>
        </div>
      </section>

      {dashboard.status === 'loading' && (
        <EconomyDashboardState type="loading" title="Cargando Administración" message="Consultando PostgreSQL y preparando indicadores operativos reales." />
      )}
      {dashboard.status === 'error' && (
        <EconomyDashboardState
          type="error"
          title="No se pudo cargar Administración"
          message={dashboard.error?.message ?? 'Error desconocido al consultar los datos administrativos.'}
          actionLabel="Reintentar"
          onAction={() => void dashboard.loadAdministrationSummary()}
          isActionDisabled={dashboard.loading}
        />
      )}
      {dashboard.status === 'empty' && (
        <EconomyDashboardState
          type="empty"
          title="Sin datos administrativos"
          message="Cuando el endpoint de Administración informe datos reales, las tarjetas evitarán completar métricas faltantes con ceros artificiales."
          actionLabel="Actualizar"
          onAction={() => void dashboard.loadAdministrationSummary()}
          isActionDisabled={dashboard.loading}
        />
      )}

      {dashboard.summary && dashboard.status === 'ready' && (
        <section className="home-dashboard-stack" aria-label="Tablero administrativo del club">
          <AdministrationHeaderCards summary={dashboard.summary} />
          <AdministrationActions />
        </section>
      )}
    </main>
  );
}
