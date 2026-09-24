import { getActivityVisual, PERMISSIONS, type AdministrationActivityDto } from '@miclub/shared';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ApiError } from '../../api';
import { useSession } from '../../session';
import { archiveAdministrationActivity, changeAdministrationActivityStatus, getAdministrationActivities } from '../../services/api/administrationApi';
import { ActivityDetailModal } from './ActivityDetailModal';
import { ActivityCreateEditModal } from './ActivityCreateEditModal';
import { activityStatusLabel, describeActivityTerms, formatActivityCivilDate, formatActivityProfitability, formatFrequency, formatMoney } from './activityPresentation';

const integer = new Intl.NumberFormat('es-AR');

const enrollmentAvailabilityLabel = (enabled: boolean, count: number) => enabled
  ? `Inscripciones habilitadas, ${integer.format(count)} ${count === 1 ? 'inscripto activo' : 'inscriptos activos'}`
  : 'Inscripciones deshabilitadas';

export function EnrollmentAvailability({ enabled, count }: { enabled: boolean; count: number }) {
  const label = enrollmentAvailabilityLabel(enabled, count);

  return <span className="activity-list__enrollments" data-enabled={enabled} role="img" aria-label={label} title={label}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 18c0-3 2.2-5 5.5-5 1.7 0 3.1.5 4.1 1.4" />
      {enabled ? <path d="M18 12v7m-3.5-3.5h7" /> : <path d="m15 13 6 6m0-6-6 6" />}
    </svg>
    {enabled && <strong aria-hidden="true">{integer.format(count)}</strong>}
  </span>;
}

export function ActivityList({ canViewFinancials }: { canViewFinancials: boolean }) {
  const [activities, setActivities] = useState<AdministrationActivityDto[]>([]);
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
    setLoading(true); setError(null);
    try { setActivities((await getAdministrationActivities(signal)).items); }
    catch (loadError) { if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las actividades.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller=new AbortController();const timer=window.setTimeout(()=>void load(controller.signal),0);return()=>{window.clearTimeout(timer);controller.abort();}; }, [load]);
  useEffect(() => { const openCreation=()=>{if(canCreate)setEditingActivity('new');};window.addEventListener('miclub:create-activity',openCreation);return()=>window.removeEventListener('miclub:create-activity',openCreation); }, [canCreate]);

  const selectedActivity=activities.find(activity=>activity.id===selectedActivityId);
  const ranking=useMemo(()=>activities.filter(activity=>activity.annualOperatingProfitabilityStatus==='AVAILABLE'&&activity.annualOperatingProfitability!=null).sort((a,b)=>(b.annualOperatingProfitability??0)-(a.annualOperatingProfitability??0)),[activities]);
  const mutate=async(activity:AdministrationActivityDto,operation:'status'|'archive')=>{
    if(operation==='archive'&&!window.confirm(`¿Archivar “${activity.name}”?\n\nDejará de mostrarse, pero su historia permanecerá conservada.`))return;
    setMutationId(activity.id);setError(null);
    try { if(operation==='archive'){await archiveAdministrationActivity(activity.id,activity.updatedAt);setSelectedActivityId(null);}else await changeAdministrationActivityStatus(activity.id,activity.updatedAt,activity.status==='active'?'inactive':'active');await load(); }
    catch(reason){const dependencies=reason instanceof ApiError&&reason.code==='ACTIVITY_HAS_DEPENDENCIES';throw new Error(dependencies?`No se puede archivar “${activity.name}” porque tiene inscripciones, movimientos o términos asociados.`:reason instanceof Error?reason.message:'No se pudo modificar la actividad.');}
    finally{setMutationId(null);}
  };

  return <section className="section-panel activity-list" aria-labelledby="activity-list-title" aria-busy={loading}>
    <div className="section-header activity-list__header"><div><p className="eyebrow">Actividades</p><h3 id="activity-list-title">Actividades del club</h3><p>{activities.length} actividades configuradas · operación, inscripciones y rentabilidad anual.</p></div><div className="activity-list__header-actions">{canCreate&&<button className="primary-btn" type="button" onClick={()=>setEditingActivity('new')}>Crear nueva actividad</button>}<button className="ghost-btn" type="button" onClick={()=>void load()} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button></div></div>
    {error&&<div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={()=>void load()}>Reintentar</button></div>}
    {!error&&loading&&activities.length===0&&<p className="sector-list__state" role="status">Cargando actividades…</p>}
    {!error&&!loading&&activities.length===0&&<p className="sector-list__state">Todavía no hay actividades configuradas.</p>}
    {activities.length>0&&<div className="activity-list__table-wrap"><table className="activity-list__table" data-financial={canViewFinancials}><colgroup><col/><col/><col/><col/><col/><col/><col/><col/>{canViewFinancials&&<col/>}<col/></colgroup><thead><tr><th>Actividad</th><th>Sector</th><th>Responsables</th><th>Estado</th><th>Inscripciones</th><th>Condición económica</th><th>Precios</th><th>Color</th>{canViewFinancials&&<th>Rentabilidad operativa anual</th>}<th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{activities.map(activity=>{const visual=getActivityVisual(activity.iconKey);const color=activity.color||'#91A4C8';return <tr key={activity.id} className="activity-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${activity.name}. ${enrollmentAvailabilityLabel(activity.generatesEnrollments,activity.currentEnrollments??0)}`} onClick={()=>setSelectedActivityId(activity.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedActivityId(activity.id);}}}>
      <td data-label="Actividad"><span className="activity-list__identity" style={{'--activity-color':color} as CSSProperties}><i aria-hidden="true">{visual.glyph}</i><strong title={activity.name}>{activity.name}</strong></span></td><td data-label="Sector"><strong title={activity.sectorName||'Sin sector'}>{activity.sectorName||'Sin sector'}</strong></td><td data-label="Responsables"><span className="activity-list__people" title={activity.responsibleEmployeeName||activity.instructorName||'Sin asignar'}><strong>{activity.responsibleEmployeeName||activity.instructorName||'Sin asignar'}</strong><small>Receptor: {activity.responsiblePersonName||activity.responsibleEmployeeName||'automático'}</small></span></td><td data-label="Estado"><span className="activity-list__status" data-active={activity.status==='active'}>{activityStatusLabel(activity.status)}</span></td><td data-label="Inscripciones"><EnrollmentAvailability enabled={activity.generatesEnrollments} count={activity.currentEnrollments??0}/></td><td data-label="Condición económica"><span className="activity-list__terms"><strong>{describeActivityTerms(activity)}</strong><small>{activity.termsEffectiveFrom?`Desde ${formatActivityCivilDate(activity.termsEffectiveFrom)}`:'Sin vigencia'}</small></span></td><td data-label="Precios"><span className="activity-list__prices">{activity.pricingConfigured?<><strong>Inscripción {formatMoney(activity.enrollmentPrice??0,activity.priceCurrencyCode??activity.operatingCurrencyCode)}</strong><small>Cuota {formatMoney(activity.feePrice??0,activity.priceCurrencyCode??activity.operatingCurrencyCode)} · {formatFrequency(activity.feeFrequency)}</small></>:<strong>Sin configurar</strong>}</span></td><td data-label="Color"><span className="activity-list__color" role="img" aria-label={`Color ${color.toUpperCase()}`} title={color.toUpperCase()}><i style={{backgroundColor:color}}/></span></td>{canViewFinancials&&<td data-label="Rentabilidad anual"><span className="activity-list__financial"><strong data-negative={(activity.annualOperatingProfitability??0)<0}>{formatActivityProfitability(activity)}</strong><small>{activity.annualOperatingMovements??0} movimientos · {activity.annualOperatingProfitabilityYear??''}</small></span></td>}<td><span className="activity-list__arrow" aria-hidden="true">›</span></td>
    </tr>;})}</tbody></table></div>}
    {selectedActivity&&<ActivityDetailModal key={selectedActivity.id} activity={selectedActivity} canEdit={canEdit} canArchive={canArchive} busy={mutationId===selectedActivity.id} onClose={()=>setSelectedActivityId(null)} onEdit={()=>{setEditingActivity(selectedActivity);setSelectedActivityId(null);}} onStatus={()=>mutate(selectedActivity,'status')} onArchive={()=>mutate(selectedActivity,'archive')}/>}
    {editingActivity&&<ActivityCreateEditModal activity={editingActivity==='new'?undefined:editingActivity} onClose={()=>setEditingActivity(null)} onSaved={()=>{setEditingActivity(null);void load();}}/>}
    {canViewFinancials?<section className="activity-ranking" aria-labelledby="activity-ranking-title"><div><p className="eyebrow">Ranking anual</p><h4 id="activity-ranking-title">Rentabilidad operativa por actividad {activities[0]?.annualOperatingProfitabilityYear??''}</h4><p>Movimientos operativos completados, convertidos a la moneda base del club.</p></div>{ranking.length?<ol>{ranking.map((activity,index)=><li key={activity.id}><b>{index+1}</b><span><strong title={activity.name}>{activity.name}</strong><small>{activity.annualOperatingMovements??0} movimientos asociados</small></span><em data-negative={(activity.annualOperatingProfitability??0)<0}>{formatActivityProfitability(activity)}</em></li>)}</ol>:<p className="sector-list__state">No hay rentabilidad operativa disponible para el año actual.</p>}</section>:<p className="worker-list__notice">La información financiera de actividades no está disponible para tu membresía.</p>}
  </section>;
}
