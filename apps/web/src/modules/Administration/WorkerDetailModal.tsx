import type { AdministrationWorkerDto } from '@miclub/shared';
import { useEffect, useId, useRef } from 'react';

type Props = { worker: AdministrationWorkerDto; onClose: () => void };
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

export function WorkerDetailModal({ worker, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

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

  const permissions = worker.permissions ?? [];
  const activities = worker.activities ?? [];
  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sector-modal worker-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
      <header className="sector-modal__header"><div><p className="eyebrow">Ficha del trabajador</p><h2 id={titleId}>{worker.displayName}</h2><p id={descriptionId}>Información personal, laboral y de acceso de solo lectura.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar ficha de ${worker.displayName}`}>×</button></header>
      {worker.roleGuard?.isDirector && !worker.roleGuard.canRemoveDirectorRole && <div className="worker-modal__guard" role="note"><strong>Rol protegido</strong><span>{worker.roleGuard.reason} Una futura edición deberá validar esta condición antes de quitar o desactivar el rol.</span></div>}
      <section><h3>Datos personales y contacto</h3><dl className="sector-modal__facts"><div><dt>Nombre</dt><dd>{worker.displayName}</dd></div><div><dt>DNI</dt><dd>{worker.dni || 'No informado'}</dd></div><div><dt>Teléfono</dt><dd>{worker.phone || 'No informado'}</dd></div><div><dt>Correo electrónico</dt><dd>{worker.email || 'No informado'}</dd></div></dl></section>
      <section><h3>Relación laboral</h3><dl className="sector-modal__facts"><div><dt>Rol</dt><dd>{worker.role || 'Sin asignar'}</dd></div><div><dt>Sector</dt><dd>{worker.sector || 'Sin asignar'}</dd></div><div><dt>Salario</dt><dd>{worker.salary == null ? 'No disponible' : money.format(worker.salary)}</dd></div><div><dt>Estado</dt><dd><span className="worker-list__badge" data-active={worker.isActive}>{statusLabel(worker.status)}</span></dd></div><div><dt>Fecha de ingreso</dt><dd>{showDate(worker.employmentStartDate)}</dd></div><div><dt>Fecha de egreso</dt><dd>{showDate(worker.employmentEndDate)}</dd></div><div className="sector-modal__fact--wide"><dt>Notas</dt><dd>{worker.notes || 'Sin notas'}</dd></div></dl></section>
      <section><h3>Acceso y permisos <span>{permissions.length}</span></h3><p><span className="worker-list__badge" data-active={worker.systemAccess}>{worker.systemAccess ? 'Acceso habilitado' : 'Sin acceso al sistema'}</span></p>{permissions.length ? <ul className="worker-modal__chips">{permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul> : <p>Sin permisos adicionales.</p>}</section>
      <section><h3>Actividades asociadas <span>{activities.length}</span></h3>{activities.length ? <ul className="sector-modal__items">{activities.map((activity) => <li key={activity.id}><strong>{activity.name}</strong><span>{statusLabel(activity.status)}</span></li>)}</ul> : <p>No hay actividades asociadas.</p>}</section>
      <section><h3>Auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Creado</dt><dd>{showDate(worker.createdAt, true)}</dd></div><div><dt>Última actualización</dt><dd>{showDate(worker.updatedAt, true)}</dd></div><div><dt>Identificador</dt><dd><code>{worker.id}</code></dd></div></dl></section>
      <p className="activity-modal__notice" role="note">Esta ficha es de solo lectura. No modifica permisos, salario ni relación laboral.</p>
    </div>
  </div>;
}
