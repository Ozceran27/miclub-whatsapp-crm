import type { AdministrationWorkerDto, AdministrationWorkerMutationDto } from '@miclub/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

type Props = { worker?: AdministrationWorkerDto; onClose: () => void; onSave?: (input: AdministrationWorkerMutationDto) => Promise<void>; onArchive?: () => Promise<void> };
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' });
const showDate = (value?: string | null, includeTime = false) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(includeTime ? value : `${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : (includeTime ? dateTime : date).format(parsed);
};
const statusLabel = (status: string) => ({ active: 'Activo', inactive: 'Inactivo', on_leave: 'De licencia', terminated: 'Finalizado', archived: 'Archivado' }[status] ?? status.replaceAll('_', ' '));

export function WorkerDetailModal({ worker, onClose, onSave, onArchive }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<string | null>(null);
  const [hasFixedCompensation, setHasFixedCompensation] = useState(worker?.hasFixedCompensation ?? false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(focusable)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
      if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  if (!worker && !onSave) return null;
  const permissions = worker?.permissions ?? [];
  const activities = worker?.activities ?? [];
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!onSave) return; const data=new FormData(event.currentTarget); const field=(key:string)=>{const value=data.get(key);return typeof value==='string'?value:'';}; setSaving(true); setFormError(null); try { await onSave({firstName:field('firstName'),lastName:field('lastName'),dni:field('dni'),phone:field('phone')||null,email:field('email'),password:field('password')||undefined,role:field('role') as AdministrationWorkerMutationDto['role'],hasFixedCompensation,fixedCompensationAmount:hasFixedCompensation?Number(field('fixedCompensationAmount')):null,fixedCompensationFrequency:hasFixedCompensation?field('fixedCompensationFrequency') as AdministrationWorkerMutationDto['fixedCompensationFrequency']:null,currencyCode:hasFixedCompensation?field('currencyCode') as AdministrationWorkerMutationDto['currencyCode']:null,employmentStartDate:field('employmentStartDate')||null,notes:field('notes')||null}); onClose(); } catch(error){setFormError(error instanceof Error?error.message:'No se pudo guardar.');} finally{setSaving(false);} };
  const name=worker?.displayName ?? 'Nuevo trabajador';
  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sector-modal worker-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
      <header className="sector-modal__header"><div><p className="eyebrow">Ficha del trabajador</p><h2 id={titleId}>{name}</h2><p id={descriptionId}>{onSave?'Alta o edición laboral y de acceso.':'Información personal, laboral y de acceso de solo lectura.'}</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar ficha de ${name}`}>×</button></header>
      {onSave && <form onSubmit={event => { void submit(event); }} className="worker-modal__form"><label>Nombre<input name="firstName" required defaultValue={worker?.firstName??''}/></label><label>Apellido<input name="lastName" required defaultValue={worker?.lastName??''}/></label><label>DNI<input name="dni" required inputMode="numeric" defaultValue={worker?.dni??''}/></label><label>Teléfono<input name="phone" defaultValue={worker?.phone??''}/></label><label>Correo<input name="email" required type="email" defaultValue={worker?.email??''}/></label>{!worker&&<label>Contraseña<input name="password" required type="password" minLength={10}/></label>}<label>Rol<select name="role" defaultValue={(worker?.role as string)??'TRABAJADOR'}><option>TRABAJADOR</option><option>INSTRUCTOR</option><option>DIRECTOR</option></select></label><label><input type="checkbox" checked={hasFixedCompensation} onChange={event=>setHasFixedCompensation(event.target.checked)}/> Tiene remuneración fija</label>{hasFixedCompensation&&<><label>Monto (moneda operativa)<input name="fixedCompensationAmount" required type="number" min="0" step="0.01" defaultValue={worker?.fixedCompensationAmount??''}/></label><label>Moneda<select name="currencyCode" required defaultValue={worker?.currencyCode??'ARS'}><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label><label>Frecuencia<select name="fixedCompensationFrequency" required defaultValue={worker?.fixedCompensationFrequency??'MONTHLY'}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></>}<label>Fecha de ingreso<input name="employmentStartDate" type="date" defaultValue={worker?.employmentStartDate??''}/></label><label>Notas<textarea name="notes" defaultValue={worker?.notes??''}/></label><p role="note">La foto estará disponible cuando exista almacenamiento privado seguro; no se guardan imágenes base64.</p>{formError&&<p role="alert">{formError}</p>}<button type="submit" disabled={saving}>{saving?'Guardando…':'Guardar'}</button>{worker&&onArchive&&<button type="button" disabled={saving||!worker.roleGuard?.canRemoveDirectorRole} onClick={()=>void onArchive().then(onClose).catch(error=>setFormError(error instanceof Error?error.message:'No se pudo archivar.'))}>Archivar</button>}</form>}
      {worker && !onSave && <>
      {worker.roleGuard?.isDirector && !worker.roleGuard.canRemoveDirectorRole && <div className="worker-modal__guard" role="note"><strong>Rol protegido</strong><span>{worker.roleGuard.reason} Una futura edición deberá validar esta condición antes de quitar o desactivar el rol.</span></div>}
      <section><h3>Datos personales y contacto</h3><dl className="sector-modal__facts"><div><dt>Nombre</dt><dd>{worker.displayName}</dd></div><div><dt>DNI</dt><dd>{worker.dni || 'No informado'}</dd></div><div><dt>Teléfono</dt><dd>{worker.phone || 'No informado'}</dd></div><div><dt>Correo electrónico</dt><dd>{worker.email || 'No informado'}</dd></div></dl></section>
      <section><h3>Relación laboral</h3><dl className="sector-modal__facts"><div><dt>Rol</dt><dd>{worker.role || 'Sin asignar'}</dd></div><div><dt>Sector</dt><dd>{worker.sector || 'Sin asignar'}</dd></div><div><dt>Remuneración fija</dt><dd>{worker.hasFixedCompensation ? `${money.format(worker.fixedCompensationAmount ?? 0)} · ${worker.fixedCompensationFrequency}` : 'Sin remuneración fija'}</dd></div><div><dt>Estado</dt><dd><span className="worker-list__badge" data-active={worker.isActive}>{statusLabel(worker.status)}</span></dd></div><div><dt>Fecha de ingreso</dt><dd>{showDate(worker.employmentStartDate)}</dd></div><div><dt>Fecha de egreso</dt><dd>{showDate(worker.employmentEndDate)}</dd></div><div className="sector-modal__fact--wide"><dt>Notas</dt><dd>{worker.notes || 'Sin notas'}</dd></div></dl></section>
      <section><h3>Acceso y permisos <span>{permissions.length}</span></h3><p><span className="worker-list__badge" data-active={worker.systemAccess}>{worker.systemAccess ? 'Acceso habilitado' : 'Sin acceso al sistema'}</span></p>{permissions.length ? <ul className="worker-modal__chips">{permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul> : <p>Sin permisos adicionales.</p>}</section>
      <section><h3>Actividades asociadas <span>{activities.length}</span></h3>{activities.length ? <ul className="sector-modal__items">{activities.map((activity) => <li key={activity.id}><strong>{activity.name}</strong><span>{statusLabel(activity.status)}</span></li>)}</ul> : <p>No hay actividades asociadas.</p>}</section>
      <section><h3>Auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Creado</dt><dd>{showDate(worker.createdAt, true)}</dd></div><div><dt>Última actualización</dt><dd>{showDate(worker.updatedAt, true)}</dd></div><div><dt>Identificador</dt><dd><code>{worker.id}</code></dd></div></dl></section>
      <p className="activity-modal__notice" role="note">Esta ficha es de solo lectura. No modifica permisos, salario ni relación laboral.</p></>}
    </div>
  </div>;
}
