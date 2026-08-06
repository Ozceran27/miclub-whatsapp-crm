import type { AdministrationMovementDto } from '@miclub/shared';
import { useEffect, useId, useRef } from 'react';

type Props = { movement: AdministrationMovementDto; onClose: () => void };
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const showDate = (value?: string | null) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
};
const showText = (value?: string | null) => value || 'No informado';
const showStatus = (value?: string | null) => value?.replaceAll('_', ' ').toLocaleLowerCase('es-AR') || 'Sin estado';

export function MovementDetailModal({ movement, onClose }: Props) {
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

  const title = movement.concept || movement.category || 'Movimiento sin concepto';
  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sector-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
      <header className="sector-modal__header"><div><p className="eyebrow">Detalle de movimiento</p><h2 id={titleId}>{title}</h2><p id={descriptionId}>Información contable, asociaciones y trazabilidad de solo lectura.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar detalle de ${title}`}>×</button></header>
      <section><h3>Movimiento</h3><dl className="sector-modal__facts">
        <div><dt>Fecha</dt><dd>{showDate(movement.date)}</dd></div><div><dt>Tipo</dt><dd>{showStatus(movement.type)}</dd></div><div><dt>Estado operativo</dt><dd>{showStatus(movement.status)}</dd></div>
        <div><dt>Monto</dt><dd>{money.format(movement.amount)}</dd></div><div><dt>Impuestos</dt><dd>{movement.taxes == null ? 'No informados' : money.format(movement.taxes)}</dd></div><div><dt>Estado financiero</dt><dd>{showStatus(movement.financialStatus)}</dd></div>
        <div><dt>Categoría</dt><dd>{showText(movement.category)}</dd></div><div><dt>Medio de pago</dt><dd>{showText(movement.paymentMethod)}</dd></div><div><dt>Contraparte</dt><dd>{showText(movement.counterpartyText)}</dd></div>
        <div className="sector-modal__fact--wide"><dt>Concepto</dt><dd>{showText(movement.concept)}</dd></div>
      </dl></section>
      <section><h3>Asociaciones</h3><dl className="sector-modal__facts">
        <div><dt>Sector</dt><dd>{showText(movement.sector)}</dd></div><div><dt>Código de sector</dt><dd>{showText(movement.sectorCode)}</dd></div><div><dt>ID de sector</dt><dd><code>{showText(movement.sectorId)}</code></dd></div>
        <div><dt>ID de actividad</dt><dd><code>{showText(movement.activityId)}</code></dd></div><div><dt>ID de persona</dt><dd><code>{showText(movement.personId)}</code></dd></div><div><dt>ID de categoría</dt><dd><code>{showText(movement.categoryId)}</code></dd></div>
        <div><dt>ID de medio de pago</dt><dd><code>{showText(movement.paymentMethodId)}</code></dd></div>
      </dl></section>
      <section><h3>Origen y auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Fuente</dt><dd>{showText(movement.source)}</dd></div><div><dt>ID externo</dt><dd><code>{showText(movement.externalId)}</code></dd></div><div><dt>Identificador</dt><dd><code>{movement.id}</code></dd></div><div><dt>Creado</dt><dd>{showDate(movement.createdAt)}</dd></div><div><dt>Última actualización</dt><dd>{showDate(movement.updatedAt)}</dd></div></dl></section>
      <div className="detail-modal__actions"><button className="ghost-btn" type="button" disabled title="Se habilitará en una próxima versión">Editar datos financieros</button><p className="activity-modal__notice" role="note">Las mutaciones financieras están preparadas, pero permanecerán deshabilitadas hasta un próximo PR. El identificador y la auditoría nunca serán editables.</p></div>
    </div>
  </div>;
}
