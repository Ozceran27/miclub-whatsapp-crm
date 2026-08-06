import type { AdministrationActivityDto, AdministrationEnrollmentDto, AdministrationMovementDto } from '@miclub/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { getActivityEnrollments, getActivityMovements } from '../../services/api/administrationApi';

type Props = { activity: AdministrationActivityDto; onClose: () => void };
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const displayDate = (value?: string | null) => value ? dateTime.format(new Date(value)) : 'Sin registro';
const displayStatus = (value?: string | null) => value?.replaceAll('_', ' ').toLocaleLowerCase('es-AR') || 'Sin estado';

export function ActivityDetailModal({ activity, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [enrollments, setEnrollments] = useState<AdministrationEnrollmentDto[]>([]);
  const [movements, setMovements] = useState<AdministrationMovementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getActivityEnrollments(activity.id, controller.signal), getActivityMovements(activity.id, controller.signal)])
      .then(([enrollmentResponse, movementResponse]) => { setEnrollments(enrollmentResponse.items); setMovements(movementResponse.items); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el detalle relacionado.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activity.id]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previouslyFocused?.focus(); };
  }, [onClose]);

  const settlement = activity.settlementMode === 'fixed' ? 'Monto fijo' : activity.settlementMode === 'percentage' ? 'Por comisión' : activity.settlementMode || 'Sin configurar';
  const commission = activity.settlementMode === 'fixed' ? money.format(activity.settlementFixedAmount ?? 0) : `${activity.clubCommissionPercent}% club · ${activity.instructorCommissionPercent}% responsable`;

  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="sector-modal activity-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
    <header className="sector-modal__header"><div><p className="eyebrow">Detalle de actividad</p><h2 id={titleId}>{activity.name}</h2><p id={descriptionId}>Información operativa y financiera de solo lectura.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar detalle de ${activity.name}`}>×</button></header>
    <section aria-labelledby={`${titleId}-general`}><h3 id={`${titleId}-general`}>Actividad</h3><dl className="sector-modal__facts">
      <div><dt>Sector</dt><dd>{activity.sectorName || 'Sin sector'}</dd></div><div><dt>Responsable</dt><dd>{activity.managerName || activity.instructorName || 'Sin asignar'}</dd></div><div><dt>Estado</dt><dd>{displayStatus(activity.status)}</dd></div>
      <div><dt>Modalidad de liquidación</dt><dd>{settlement}</dd></div><div><dt>Cuota</dt><dd>{money.format(activity.monthlyFee)}</dd></div><div><dt>Comisión</dt><dd>{commission}</dd></div>
    </dl></section>
    <section aria-labelledby={`${titleId}-enrollments`}><h3 id={`${titleId}-enrollments`}>Inscriptos <span>{enrollments.length}</span></h3>{loading ? <p role="status">Cargando inscriptos y movimientos…</p> : enrollments.length ? <ul className="sector-modal__items">{enrollments.map((item) => <li key={item.id}><div><strong>{item.displayName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Persona sin nombre'}</strong><small>{displayStatus(item.status)} · Vence {item.dueDate ? displayDate(item.dueDate) : 'sin fecha'}</small></div><span>{money.format(item.feeAmount)}</span></li>)}</ul> : <p>No hay inscriptos asociados.</p>}</section>
    <section aria-labelledby={`${titleId}-movements`}><h3 id={`${titleId}-movements`}>Movimientos asociados <span>{movements.length}</span></h3>{!loading && (movements.length ? <ul className="sector-modal__items">{movements.map((item) => <li key={item.id}><div><strong>{item.concept || item.category || 'Sin concepto'}</strong><small>{displayDate(item.date)} · {displayStatus(item.status)}</small></div><span className={item.type === 'EGRESOS' ? 'sector-modal__amount--expense' : ''}>{money.format(item.amount)}</span></li>)}</ul> : <p>No hay movimientos asociados directamente a esta actividad.</p>)}{error && <p className="sector-modal__error" role="alert">{error}</p>}</section>
    <section aria-labelledby={`${titleId}-audit`}><h3 id={`${titleId}-audit`}>Auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Creada</dt><dd>{displayDate(activity.createdAt)}</dd></div><div><dt>Última actualización</dt><dd>{displayDate(activity.updatedAt)}</dd></div><div><dt>Identificador</dt><dd><code>{activity.id}</code></dd></div></dl></section>
    <p className="activity-modal__notice" role="note">Este detalle es de solo lectura. Abrirlo no genera movimientos automáticos.</p>
  </div></div>;
}
