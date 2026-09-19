import type { AdministrationActivityDto, AdministrationMovementDto, AdministrationSectorDto, AdministrationWorkerDto } from '@miclub/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { archiveAdministrationSector, changeAdministrationSectorStatus, getAdministrationWorkers, getSectorActivities, getSectorMovements, updateAdministrationSector } from '../../services/api/administrationApi';

type Props = { sector: AdministrationSectorDto; canEdit: boolean; canArchive: boolean; onClose: () => void; onChanged: () => Promise<void> };
const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const number = new Intl.NumberFormat('es-AR');
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });

const displayStatus = (value?: string | null) => value?.trim().replaceAll('_', ' ').toLocaleLowerCase('es-AR') || 'Sin estado';
const displayDate = (value?: string | null) => value ? date.format(new Date(value)) : 'Sin fecha';
const formText = (form: FormData, name: string) => { const value=form.get(name); return typeof value==='string' ? value.trim() : ''; };

export function SectorDetailModal({ sector, canEdit, canArchive, onClose, onChanged }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activities, setActivities] = useState<AdministrationActivityDto[]>([]);
  const [movements, setMovements] = useState<AdministrationMovementDto[]>([]);
  const [managers,setManagers]=useState<AdministrationWorkerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving,setSaving]=useState(false);
  const edit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError(null);const f=new FormData(event.currentTarget);const capacityMode=formText(f,'capacityMode')==='ENROLLMENTS'?'ENROLLMENTS':'INCOME';try{await updateAdministrationSector(sector.id,{updatedAt:sector.updatedAt,name:sector.isSystem?sector.name:formText(f,'name'),description:formText(f,'description')||null,icon:sector.iconKey??null,color:formText(f,'color'),managerPersonId:formText(f,'managerPersonId')||null,capacityMode,configuredCapacity:capacityMode==='ENROLLMENTS'?Number(formText(f,'configuredCapacity')):null});await onChanged();}catch(e){setError(e instanceof Error?e.message:'No se pudo editar.');setSaving(false);}};
  const status=async(value:'active'|'inactive'|'under_repair')=>{setSaving(true);try{await changeAdministrationSectorStatus(sector.id,sector.updatedAt,value);await onChanged();}catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el estado.');setSaving(false);}};
  const archive=async()=>{if(!window.confirm('¿Archivar este sector? La historia se conservará.'))return;setSaving(true);try{await archiveAdministrationSector(sector.id,sector.updatedAt);await onChanged();}catch(e){setError(e instanceof Error?e.message:'No se pudo archivar.');setSaving(false);}};

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getSectorActivities(sector.id, controller.signal), getSectorMovements(sector.id, controller.signal),getAdministrationWorkers(controller.signal)])
      .then(([activityResponse, movementResponse,workerResponse]) => {
        setActivities(activityResponse.items);
        setMovements(movementResponse.items);
        setManagers(workerResponse.items.filter(worker=>worker.isActive&&Boolean(worker.personId)));
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el detalle relacionado.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sector.id]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const initialFocus = dialog?.querySelector<HTMLElement>(focusable);
    initialFocus?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
      if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previouslyFocused?.focus(); };
  }, [onClose]);

  const capacity = sector.capacityDataStatus !== 'AVAILABLE' || sector.maximumCapacity == null
    ? 'Sin datos históricos'
    : `${number.format(sector.currentUsage ?? 0)} de ${number.format(sector.maximumCapacity)}`;

  return (
    <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sector-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
        <header className="sector-modal__header">
          <div><p className="eyebrow">Detalle del sector</p><h2 id={titleId}>{sector.name}</h2><p id={descriptionId}>Información operativa de solo lectura.</p></div>
          <button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar detalle de ${sector.name}`}>×</button>
        </header>

        {sector.isSystem && <div className="sector-modal__restriction" role="note"><strong>Sector de sistema</strong><span>Su identidad y archivado están bloqueados; el color y estado operativo sí pueden mantenerse.</span></div>}

        <section aria-labelledby={`${titleId}-general`}><h3 id={`${titleId}-general`}>Datos generales</h3><dl className="sector-modal__facts">
          <div><dt>Código</dt><dd>{sector.code}</dd></div><div><dt>Estado</dt><dd>{displayStatus(sector.status)}</dd></div>
          <div><dt>Responsable</dt><dd>{sector.managerName || 'Sin asignar'}</dd></div><div><dt>Horario</dt><dd>{sector.openingTime && sector.closingTime ? `${sector.openingTime.slice(0, 5)}–${sector.closingTime.slice(0, 5)}` : 'Sin horario'}</dd></div>
          <div><dt>Estado municipal</dt><dd>{displayStatus(sector.municipalStatus)}</dd></div><div><dt>Estado financiero</dt><dd>{displayStatus(sector.financialStatus)}</dd></div>
          <div className="sector-modal__fact--wide"><dt>Notas</dt><dd>{sector.notes || 'Sin notas'}</dd></div>
        </dl></section>
        {(canEdit||canArchive)&&<section><h3>Editar configuración</h3>{canEdit&&<form className="finance-form" onSubmit={e=>void edit(e)}><label>Nombre<input name="name" defaultValue={sector.name} disabled={sector.isSystem} required/></label><label>Descripción<textarea name="description" defaultValue={sector.description??''}/></label><label>Responsable<select name="managerPersonId" defaultValue={sector.managerPersonId??''}><option value="">Sin asignar</option>{managers.map(manager=><option key={manager.id} value={manager.personId??''}>{manager.displayName}</option>)}</select></label><label>Color<input name="color" type="color" defaultValue={sector.color??'#2563EB'}/></label><label>Capacidad<select name="capacityMode" defaultValue={sector.capacityMode??'INCOME'}><option value="INCOME">Ingresos</option><option value="ENROLLMENTS">Inscripciones</option></select></label><label>Cupo<input name="configuredCapacity" type="number" min="1" defaultValue={sector.configuredCapacity??''}/></label><button disabled={saving}>Guardar cambios</button></form>}<div className="sector-list__actions">{canEdit&&<><button type="button" disabled={saving||sector.status==='active'} onClick={()=>void status('active')}>Activar</button><button type="button" disabled={saving||sector.status==='inactive'} onClick={()=>void status('inactive')}>Desactivar</button></>}{canArchive&&<button type="button" disabled={saving||sector.isSystem} onClick={()=>void archive()}>Archivar</button>}</div></section>}

        <section aria-labelledby={`${titleId}-capacity`}><h3 id={`${titleId}-capacity`}>Capacidad · {sector.capacityMode === 'INCOME' ? 'Ingresos' : 'Espacio Disponible'}</h3><div className="sector-modal__capacity"><strong>{capacity}</strong>{sector.utilizationPercentage != null && <span>{number.format(sector.utilizationPercentage)}% de utilización{sector.utilizationPercentage > 100 ? ' · sobreocupación' : ''}</span>}{sector.idlePercentage != null && <span>{number.format(sector.idlePercentage)}% de capacidad ociosa</span>}<span>{number.format(sector.activeEnrollmentsCount ?? 0)} inscriptos activos</span></div></section>

        <section aria-labelledby={`${titleId}-activities`}><h3 id={`${titleId}-activities`}>Actividades <span>{activities.length}</span></h3>
          {loading ? <p role="status">Cargando actividades y movimientos…</p> : activities.length ? <ul className="sector-modal__items">{activities.map((activity) => <li key={activity.id}><div><strong>{activity.name}</strong><small>{activity.modality || 'Sin modalidad'} · {displayStatus(activity.status)}</small></div><span>{number.format(activity.currentEnrollments ?? 0)} / {activity.maxCapacity == null ? '∞' : number.format(activity.maxCapacity)}</span></li>)}</ul> : <p>No hay actividades relacionadas.</p>}
        </section>

        <section aria-labelledby={`${titleId}-movements`}><h3 id={`${titleId}-movements`}>Movimientos relacionados <span>{movements.length}</span></h3>
          {!loading && (movements.length ? <ul className="sector-modal__items">{movements.map((movement) => <li key={movement.id}><div><strong>{movement.concept || movement.category || 'Sin concepto'}</strong><small>{displayDate(movement.date)} · {displayStatus(movement.status)}</small></div><span className={movement.type === 'EGRESOS' ? 'sector-modal__amount--expense' : ''}>{money.format(movement.amount)}</span></li>)}</ul> : <p>No hay movimientos relacionados.</p>)}
          {error && <p className="sector-modal__error" role="alert">{error}</p>}
        </section>
      </div>
    </div>
  );
}
