import { AdministrationActions } from './Administration/AdministrationActions';
import { AdministrationHeaderCards } from './Administration/AdministrationHeaderCards';
import { useAdministrationSummary } from './Administration/useAdministrationSummary';
import { SectorList } from './Administration/SectorList';
import { ActivityList } from './Administration/ActivityList';
import { EconomyDashboardState } from './Economy/EconomyDashboardState';
import { WorkerList } from './Administration/WorkerList';
import { TaskPanel } from './Administration/TaskPanel';
import { RequestPanel } from './Administration/RequestPanel';
import { MovementList } from './Administration/MovementList';
import { EnrollmentList } from './Administration/EnrollmentList';
import { MovementCreateModal } from './Administration/MovementCreateModal';
import { EnrollmentCreateModal } from './Administration/EnrollmentCreateModal';
import { useSession } from '../session';
import { useState } from 'react';
import { getAdministrationCapabilities, type AdministrationCapability } from '../administrationCapabilities';

function UnavailableSurface({ capability, title }: { capability: AdministrationCapability; title: string }) {
  return <section className="section-panel" data-capability={capability}><p className="eyebrow">{title}</p><h3>Contenido no disponible</h3><p>Tu membresía no permite consultar este recurso. Si necesitás acceso, contactá a una persona administradora del club.</p></section>;
}

export default function AdministrationModule() {
  const dashboard = useAdministrationSummary();
  const session=useSession(); const [movementOpen,setMovementOpen]=useState(false),[enrollmentOpen,setEnrollmentOpen]=useState(false);
  const capabilities = getAdministrationCapabilities(session.permissions);

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
          <AdministrationActions onCreateMovement={()=>setMovementOpen(true)} onCreateEnrollment={()=>setEnrollmentOpen(true)} canCreateMovement={capabilities.createMovement} canCreateEnrollment={capabilities.createEnrollment}/>
        </section>
      )}
      {capabilities.sectors ? <SectorList /> : <UnavailableSurface capability="sectors" title="Sectores" />}
      {capabilities.activities ? <ActivityList canViewFinancials={capabilities.activityFinancials} /> : <UnavailableSurface capability="activities" title="Actividades" />}
      {capabilities.enrollments ? <EnrollmentList /> : <UnavailableSurface capability="enrollments" title="Inscripciones" />}
      {capabilities.movements ? <MovementList /> : <UnavailableSurface capability="movements" title="Movimientos" />}
      {capabilities.workers ? <WorkerList /> : <UnavailableSurface capability="workers" title="Trabajadores" />}
      {capabilities.tasks ? <TaskPanel canCreate={capabilities.createTask} canEdit={capabilities.editTask} /> : <UnavailableSurface capability="tasks" title="Tareas" />}
      {capabilities.requests ? <RequestPanel canApprove={capabilities.approveRequest} canReject={capabilities.rejectRequest} /> : <UnavailableSurface capability="requests" title="Solicitudes" />}
      {capabilities.createMovement && <MovementCreateModal open={movementOpen} onClose={()=>setMovementOpen(false)} onCreated={()=>void dashboard.loadAdministrationSummary()}/>}
      {capabilities.createEnrollment && <EnrollmentCreateModal open={enrollmentOpen} onClose={()=>setEnrollmentOpen(false)} onCreated={()=>void dashboard.loadAdministrationSummary()}/>}
    </main>
  );
}
