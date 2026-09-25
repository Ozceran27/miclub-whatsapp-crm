import type { AdministrationEnrollmentDto } from '@miclub/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { PERMISSIONS } from '@miclub/shared';
import { apiJson } from '../../api';
import { useSession } from '../../session';
import { EnrollmentReceivables } from './EnrollmentReceivables';
import { invalidateTenantQueries } from '../../serverState/invalidation';

type Props = { enrollment: AdministrationEnrollmentDto; onClose: () => void; onChanged: () => void };
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const showDate = (value?: string | null, audit = false) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(audit || value.includes('T') ? value : `${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : (audit ? dateTime : date).format(parsed);
};
const showText = (value?: string | null) => value || 'No informado';
const showStatus = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toLocaleUpperCase('es-AR'));
const showNotes = (notes: unknown) => {
  if (notes == null || notes === '') return 'Sin notas';
  if (typeof notes === 'string') return notes;
  try { return JSON.stringify(notes, null, 2); } catch { return 'Notas no disponibles'; }
};

export function EnrollmentDetailModal({ enrollment, onClose, onChanged }: Props) {
  const {permissions,clubId}=useSession();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const abandon=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const f=new FormData(event.currentTarget);setBusy(true);setError('');void apiJson(`/api/finance/enrollments/${enrollment.id}/abandon`,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({decision:f.get('decision'),reason:f.get('reason')})}).then(()=>{invalidateTenantQueries(clubId);window.dispatchEvent(new Event('miclub:receivables-changed'));onChanged();}).catch(cause=>setError(cause instanceof Error?cause.message:'No se pudo registrar la baja.')).finally(()=>setBusy(false));};
  const titleId = useId(); const descriptionId = useId(); const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current; dialog?.querySelector<HTMLElement>(focusable)?.focus();
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
  const name = enrollment.displayName || `${enrollment.firstName || ''} ${enrollment.lastName || ''}`.trim() || 'Persona sin nombre';
  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="sector-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
    <header className="sector-modal__header"><div><p className="eyebrow">Detalle de inscripción</p><h2 id={titleId}>{name}</h2><p id={descriptionId}>Datos de la persona, actividad, cuota y trazabilidad de solo lectura.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar detalle de ${name}`}>×</button></header>
    <section><h3>Persona</h3><dl className="sector-modal__facts"><div><dt>Nombre completo</dt><dd>{name}</dd></div><div><dt>Nombre</dt><dd>{showText(enrollment.firstName)}</dd></div><div><dt>Apellido</dt><dd>{showText(enrollment.lastName)}</dd></div><div><dt>DNI</dt><dd>{showText(enrollment.dni)}</dd></div><div><dt>ID de persona</dt><dd><code>{enrollment.personId}</code></dd></div></dl></section>
    <section><h3>Inscripción</h3><dl className="sector-modal__facts"><div><dt>Número</dt><dd>#{enrollment.sequenceNumber}</dd></div><div><dt>Actividad</dt><dd>{showText(enrollment.activityName)}</dd></div><div><dt>Sector</dt><dd>{showText(enrollment.sectorName)}</dd></div><div><dt>Estado</dt><dd>{showStatus(enrollment.status)}</dd></div><div><dt>Vencimiento</dt><dd>{showDate(enrollment.dueDate)}</dd></div><div><dt>Cuota</dt><dd>{money.format(enrollment.feeAmount)}</dd></div><div><dt>ID de actividad</dt><dd><code>{enrollment.activityId}</code></dd></div><div><dt>ID de sector</dt><dd><code>{showText(enrollment.sectorId)}</code></dd></div><div className="sector-modal__fact--wide"><dt>Notas</dt><dd><pre className="detail-modal__notes">{showNotes(enrollment.notes)}</pre></dd></div></dl></section>
    {permissions.includes(PERMISSIONS.FINANCE_READ)&&<EnrollmentReceivables key={`${enrollment.id}-${enrollment.clubId}`} enrollmentId={enrollment.id}/>}
    <section><h3>Origen y auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Fuente</dt><dd>{showText(enrollment.source)}</dd></div><div><dt>ID externo</dt><dd><code>{showText(enrollment.externalId)}</code></dd></div><div><dt>Identificador</dt><dd><code>{enrollment.id}</code></dd></div><div><dt>ID del club</dt><dd><code>{showText(enrollment.clubId)}</code></dd></div><div><dt>Creada</dt><dd>{showDate(enrollment.createdAt, true)}</dd></div><div><dt>Última actualización</dt><dd>{showDate(enrollment.updatedAt, true)}</dd></div></dl></section>
    {permissions.includes(PERMISSIONS.ENROLLMENTS_CANCEL)&&!['abandonado','cancelado'].includes(enrollment.status)&&<section><h3>Registrar abandono</h3><p>Elija cómo tratar la deuda existente y deje un motivo auditable.</p><form className="finance-form" onSubmit={abandon}><label>Deuda existente<select name="decision" required defaultValue=""><option value="">Elegir…</option><option value="KEEP">Conservar deuda</option><option value="FORGIVE">Perdonar deuda</option></select></label><label>Motivo<input name="reason" required/></label><button disabled={busy}>{busy?'Registrando…':'Registrar abandono'}</button></form>{error&&<p role="alert">{error}</p>}</section>}
  </div></div>;
}
