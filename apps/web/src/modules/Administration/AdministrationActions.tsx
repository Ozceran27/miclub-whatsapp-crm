import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getLayoutViewport, toLayoutRect } from '../../layoutViewport';

type Operation = 'movement' | 'enrollment' | 'quota' | 'sector' | 'worker' | 'activity';
type AdministrationAction = {
  operation?: Operation;
  label: string;
  description: string;
  icon: string;
  availability: 'enabled' | 'coming-soon';
};

export const administrationActions: readonly AdministrationAction[] = [
  { operation: 'movement', label: 'Cargar Movimiento', description: 'Registrá ingresos, egresos o ajustes administrativos del club.', icon: '↕', availability: 'enabled' },
  { operation: 'enrollment', label: 'Cargar Inscripción', description: 'Iniciá el alta de una persona en una actividad o plan.', icon: '📝', availability: 'enabled' },
  { operation: 'quota', label: 'Cargar Cuota', description: 'Generá cuotas mensuales y consultá sus saldos en Inscripciones.', icon: '💳', availability: 'enabled' },
  { label: 'Crear Reserva', description: 'Permitirá reservar espacios y recursos con disponibilidad, pagos y reglas de cancelación.', icon: '📅', availability: 'coming-soon' },
  { label: 'Cargar Socio', description: 'Permitirá dar de alta o actualizar los datos principales de un socio.', icon: '👤', availability: 'coming-soon' },
  { operation: 'sector', label: 'Gestionar Sectores', description: 'Creá sectores y administrá su identidad visual, capacidad y estado.', icon: '🏟️', availability: 'enabled' },
  { operation: 'activity', label: 'Gestionar Actividades', description: 'Creá actividades y configurá su operación y liquidación.', icon: '⭐', availability: 'enabled' },
  { operation: 'worker', label: 'Gestionar Trabajadores', description: 'Creá trabajadores e instructores y mantené sus roles y responsabilidades.', icon: '🧑', availability: 'enabled' },
  { label: 'Gestionar Categorías', description: 'Permitirá organizar categorías administrativas para clasificar operaciones.', icon: '🏷️', availability: 'coming-soon' },
  { label: 'Gestionar Membresías', description: 'Permitirá administrar planes y condiciones comerciales del club.', icon: '🎟️', availability: 'coming-soon' },
] as const;

type AdministrationActionsProps = {
  onCreateMovement: () => void;
  onCreateEnrollment: () => void;
  onLoadQuota: () => void;
  onCreateSector: () => void;
  onCreateWorker: () => void;
  onCreateActivity: () => void;
  canCreateMovement: boolean;
  canCreateEnrollment: boolean;
  canLoadQuota: boolean;
  canCreateSector: boolean;
  canCreateWorker: boolean;
  canCreateActivity: boolean;
};

const TOOLTIP_GAP = 10;
function ActionCard({ action, run, permitted }: { action: AdministrationAction; run?: () => void; permitted: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const comingSoon = action.availability === 'coming-soon';
  const disabled = comingSoon || !permitted;
  const status = comingSoon ? 'Próximamente' : !permitted ? 'Sin permiso' : null;
  const tooltip = `${action.description}${comingSoon ? ' Próximamente.' : !permitted ? ' Tu membresía no permite ejecutar esta acción.' : ''}`;

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchorRect = iconRef.current?.getBoundingClientRect() ?? buttonRef.current?.getBoundingClientRect();
      const popup = tooltipRef.current;
      if (!anchorRect || !popup) return;
      const viewport = getLayoutViewport();
      const anchor = toLayoutRect(anchorRect, viewport.zoom);
      const margin = 12;
      const left = Math.min(Math.max(anchor.left + anchor.width / 2 - popup.offsetWidth / 2, margin), viewport.width - popup.offsetWidth - margin);
      const top = anchor.top > popup.offsetHeight + TOOLTIP_GAP + margin ? anchor.top - popup.offsetHeight - TOOLTIP_GAP : anchor.bottom + TOOLTIP_GAP;
      setPosition({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open]);

  return <>
    <button ref={buttonRef} aria-describedby={open ? tooltipId : undefined} aria-disabled={disabled} className="administration-action-card" data-availability={comingSoon ? 'coming-soon' : !permitted ? 'forbidden' : 'enabled'} onBlur={() => setOpen(false)} onClick={() => { if (!disabled) run?.(); }} onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} type="button">
      <span className="administration-action-card__muted-content"><span ref={iconRef} className="administration-action-card__icon" aria-hidden="true">{action.icon}</span><span className="administration-action-card__title"><strong>{action.label}</strong></span></span>
      {status && <span className="administration-action-card__badge">{status}</span>}
    </button>
    {open && createPortal(<div ref={tooltipRef} id={tooltipId} className="administration-action-tooltip" role="tooltip" style={{ top: position.top, left: position.left }}>{tooltip}</div>, document.body)}
  </>;
}

export function AdministrationActions(props: AdministrationActionsProps) {
  const operation: Record<Operation, { run: () => void; permitted: boolean }> = {
    movement: { run: props.onCreateMovement, permitted: props.canCreateMovement },
    enrollment: { run: props.onCreateEnrollment, permitted: props.canCreateEnrollment },
    quota: { run: props.onLoadQuota, permitted: props.canLoadQuota },
    sector: { run: props.onCreateSector, permitted: props.canCreateSector },
    worker: { run: props.onCreateWorker, permitted: props.canCreateWorker },
    activity: { run: props.onCreateActivity, permitted: props.canCreateActivity },
  };
  return <section className="section-panel administration-actions" aria-labelledby="administration-actions-title">
    <div className="section-header administration-actions__header"><div><p className="eyebrow">Acciones rápidas</p><h3 id="administration-actions-title">Administración del club</h3><p>Elegí una acción. Posá el cursor o enfocá una tarjeta para conocer su utilidad.</p></div></div>
    <div className="administration-actions__grid">{administrationActions.map(action => { const configured = action.operation ? operation[action.operation] : undefined; return <ActionCard key={action.label} action={action} run={configured?.run} permitted={configured?.permitted ?? false}/>; })}</div>
  </section>;
}
