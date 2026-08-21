import type { AdministrationActivityDto, EconomySectorBreakdownItem, EconomySectorRankings } from '@miclub/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PERMISSIONS } from '@miclub/shared';
import { ApiError } from '../../api';
import { useSession } from '../../session';
import { archiveAdministrationActivity, changeAdministrationActivityStatus, getAdministrationActivities, getAnnualActivityRanking } from '../../services/api/administrationApi';
import { ActivityDetailModal } from './ActivityDetailModal';
import { ActivityCreateEditModal } from './ActivityCreateEditModal';

const integer = new Intl.NumberFormat('es-AR');
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const activityIcons: Record<string, string> = { football: '⚽', basketball: '🏀', volleyball: '🏐', tennis: '🎾', swimming: '🏊', running: '🏃', cycling: '🚴', gym: '🏋️', weights: '💪', yoga: '🧘', pilates: '🤸', dance: '💃', 'martial-arts': '🥋', boxing: '🥊', hockey: '🏑', rugby: '🏉', skating: '⛸️', handball: '🤾', gymnastics: '🤸‍♀️', other: '⭐' };

const displayStatus = (status: string) => status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toLocaleUpperCase('es-AR'));
const commission = (activity: AdministrationActivityDto) => activity.settlementMode?.toLowerCase() === 'fixed'
  ? `Fijo ${money.format(activity.settlementFixedAmount ?? 0)}`
  : activity.settlementMode?.toLowerCase() === 'variable' ? `Variable ${activity.clubSharePercentage ?? activity.clubCommissionPercent}% club` : 'Sin términos vigentes';

export function ActivityList({ canViewFinancials }: { canViewFinancials: boolean }) {
  const [activities, setActivities] = useState<AdministrationActivityDto[]>([]);
  const [ranking, setRanking] = useState<EconomySectorRankings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<AdministrationActivityDto | 'new' | null>(null);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const session = useSession();
  const canCreate = session.permissions.includes(PERMISSIONS.ACTIVITIES_CREATE);
  const canEdit = session.permissions.includes(PERMISSIONS.ACTIVITIES_EDIT);
  const canArchive = session.permissions.includes(PERMISSIONS.ACTIVITIES_ARCHIVE);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [activityResponse, rankingResponse] = await Promise.all([
        getAdministrationActivities(signal),
        canViewFinancials ? getAnnualActivityRanking(signal) : Promise.resolve(null),
      ]);
      setActivities(activityResponse.items);
      setRanking(rankingResponse);
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las actividades.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [canViewFinancials]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const annualItems = ranking?.annual.items ?? [];
  const financialByActivity = useMemo(() => new Map(annualItems.filter(({ id }) => id).map((item) => [item.id, item])), [annualItems]);
  const selectedActivity = activities.find(({ id }) => id === selectedActivityId);
  const mutate = async (activity: AdministrationActivityDto, operation: 'status' | 'archive') => {
    if (operation === 'archive' && !window.confirm(`¿Archivar “${activity.name}”? Esta acción se rechazará si existen dependencias.`)) return;
    setMutationId(activity.id); setError(null);
    try {
      if (operation === 'archive') await archiveAdministrationActivity(activity.id, activity.updatedAt);
      else await changeAdministrationActivityStatus(activity.id, activity.updatedAt, activity.status === 'active' ? 'inactive' : 'active');
      setSelectedActivityId(null); await load();
    } catch (reason) {
      const dependencies = reason instanceof ApiError && reason.code === 'ACTIVITY_HAS_DEPENDENCIES';
      setError(dependencies ? `No se puede archivar “${activity.name}” porque tiene inscripciones, movimientos o términos asociados.` : reason instanceof Error ? reason.message : 'No se pudo modificar la actividad.');
    } finally { setMutationId(null); }
  };

  return (
    <section className="section-panel activity-list" aria-labelledby="activity-list-title" aria-busy={loading}>
      <div className="section-header activity-list__header">
        <div><p className="eyebrow">Actividades</p><h3 id="activity-list-title">Actividades del club</h3><p>{activities.length} actividades configuradas y su asociación financiera anual.</p></div>
        <div className="activity-list__header-actions">{canCreate && <button className="primary-btn" type="button" onClick={() => setEditingActivity('new')}>Crear Nueva Actividad</button>}<button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar actividades'}</button></div>
      </div>
      {error && <div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Reintentar</button></div>}
      {!error && loading && activities.length === 0 && <p className="sector-list__state" role="status">Cargando actividades reales…</p>}
      {!error && !loading && activities.length === 0 && <p className="sector-list__state">Todavía no hay actividades configuradas.</p>}
      {activities.length > 0 && <div className="activity-list__table-wrap"><table className="activity-list__table"><thead><tr><th>Nombre</th><th>Sector</th><th>Responsable</th><th>Estado</th><th>Inscriptos</th><th>Modalidad</th><th>Comisión / monto fijo</th><th>Color</th><th>Genera inscripciones</th><th>Métrica financiera anual</th><th>Acciones</th></tr></thead><tbody>{activities.map((activity) => {
        const financial = financialByActivity.get(activity.id);
        return <tr key={activity.id} className="activity-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${activity.name}`} onClick={() => setSelectedActivityId(activity.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedActivityId(activity.id); } }}><td><strong><span aria-hidden="true">{activityIcons[activity.iconKey || 'other'] || '⭐'} </span>{activity.name}</strong></td><td>{activity.sectorName || 'Sin sector'}</td><td>{activity.instructorName || 'Sin asignar'}</td><td><span className="activity-list__status" data-active={activity.status === 'active'}>{displayStatus(activity.status)}</span></td><td>{integer.format(activity.currentEnrollments ?? 0)}</td><td>{activity.modality || 'Sin modalidad'}</td><td>{commission(activity)}</td><td><span className="activity-list__color"><i style={{ backgroundColor: activity.color || '#91a4c8' }} />{activity.color || 'Sin color'}</span></td><td>{activity.generatesEnrollments ? 'Sí' : 'No'}</td><td>{financial ? <FinancialMetric item={financial} /> : <span className="activity-list__unlinked">sin asociación financiera directa</span>}</td><td><div className="activity-list__actions" onClick={(event) => event.stopPropagation()}>{canEdit && <><button type="button" onClick={() => setEditingActivity(activity)}>Editar</button><button type="button" disabled={mutationId === activity.id} onClick={() => void mutate(activity, 'status')}>{activity.status === 'active' ? 'Desactivar' : 'Activar'}</button></>}{canArchive && <button className="activity-list__archive" type="button" disabled={mutationId === activity.id} onClick={() => void mutate(activity, 'archive')}>Archivar</button>}</div></td></tr>;
      })}</tbody></table></div>}
      {selectedActivity && <ActivityDetailModal activity={selectedActivity} onClose={() => setSelectedActivityId(null)} />}
      {editingActivity && <ActivityCreateEditModal activity={editingActivity === 'new' ? undefined : editingActivity} onClose={() => setEditingActivity(null)} onSaved={() => { setEditingActivity(null); void load(); }} />}
      {canViewFinancials ? <section className="activity-ranking" aria-labelledby="activity-ranking-title"><div><p className="eyebrow">Ranking anual</p><h4 id="activity-ranking-title">Rentabilidad por actividad {ranking?.annual.year ?? ''}</h4><p>Calculado exclusivamente con movimientos asociados mediante <code>activity_id</code>.</p></div>{annualItems.length ? <ol>{annualItems.map((item, index) => <li key={item.id ?? item.name}><b>{index + 1}</b><span><strong>{item.name}</strong><small>{item.movements} movimientos · Ingresos {money.format(item.income)} · Egresos {money.format(item.expenses)}</small></span><em>{money.format(item.balance)}</em></li>)}</ol> : <p className="sector-list__state">No hay movimientos con asociación financiera directa para el año actual.</p>}</section> : <p className="worker-list__notice">La información financiera de actividades no está disponible para tu membresía.</p>}
    </section>
  );
}

function FinancialMetric({ item }: { item: EconomySectorBreakdownItem }) {
  return <span className="activity-list__financial"><strong>{money.format(item.balance)}</strong><small>{item.movements} mov.</small></span>;
}
