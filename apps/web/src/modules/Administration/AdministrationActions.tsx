import { useId, useState } from 'react';

type AdministrationAction = {
  operation?: 'movement' | 'enrollment' | 'sector' | 'worker' | 'activity';
  label: string;
  description: string;
  icon: string;
  placeholder?: {
    pendingDefinitions: string[];
  };
};

const preparedFeedback = 'Funcionalidad preparada para una próxima fase';
const reservationDefinitions = [
  'modelo de reservas',
  'disponibilidad',
  'pagos',
  'membresías',
  'reglas de cancelación'
];

const administrationActions: AdministrationAction[] = [
  { operation: 'movement', label: 'Cargar Movimiento', description: 'Registrar ingresos, egresos o ajustes administrativos del club.', icon: '↕' },
  { operation: 'enrollment', label: 'Cargar Inscripción', description: 'Iniciar el alta de una persona en una actividad o plan.', icon: '📝' },
  { label: 'Cargar Cuota', description: 'Gestionar la carga de cuotas y vencimientos asociados.', icon: '💳' },
  {
    label: 'Crear Reserva',
    description: 'Próxima etapa: reservas de espacios y recursos, una vez definidas sus reglas operativas.',
    icon: '📅',
    placeholder: { pendingDefinitions: reservationDefinitions }
  },
  { label: 'Cargar Socio', description: 'Dar de alta o actualizar los datos principales de un socio.', icon: '👤' },
  { operation: 'sector', label: 'Gestionar Sectores', description: 'Crear un sector y administrar cupos y metadatos visibles del club.', icon: '🏟️' },
  { label: 'Gestionar Categorías', description: 'Organizar categorías administrativas para clasificar operaciones.', icon: '🏷️' },
  { operation: 'worker', label: 'Gestionar Trabajadores', description: 'Crear trabajadores y mantener sus roles y responsabilidades.', icon: '🧑‍💼' },
  { operation: 'activity', label: 'Gestionar Actividades', description: 'Crear actividades y configurar su operación y liquidación.', icon: '⭐' },
  {
    label: 'Gestionar Membresías',
    description: 'Próxima etapa: planes y condiciones comerciales, luego de validar el modelo integral.',
    icon: '🎟️',
    placeholder: { pendingDefinitions: reservationDefinitions }
  }
];

type AdministrationActionsProps = {
  onCreateMovement: () => void;
  onCreateEnrollment: () => void;
  onCreateSector: () => void;
  onCreateWorker: () => void;
  onCreateActivity: () => void;
  canCreateMovement: boolean;
  canCreateEnrollment: boolean;
  canCreateSector: boolean;
  canCreateWorker: boolean;
  canCreateActivity: boolean;
};

export function AdministrationActions(props: AdministrationActionsProps) {
  const feedbackId = useId();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handlePreparedAction = (action: AdministrationAction) => {
    const detail = action.placeholder
      ? `Disponible en una próxima etapa. Antes se definirán: ${action.placeholder.pendingDefinitions.join(', ')}`
      : preparedFeedback;

    setSelectedAction(`${action.label}: ${detail}`);
  };

  const operation = {
    movement: { run: props.onCreateMovement, enabled: props.canCreateMovement },
    enrollment: { run: props.onCreateEnrollment, enabled: props.canCreateEnrollment },
    sector: { run: props.onCreateSector, enabled: props.canCreateSector },
    worker: { run: props.onCreateWorker, enabled: props.canCreateWorker },
    activity: { run: props.onCreateActivity, enabled: props.canCreateActivity },
  } as const;

  const feedbackMessage = selectedAction ? `${selectedAction}.` : 'Seleccioná una acción administrativa para continuar.';

  return (
    <section className="section-panel administration-actions" aria-labelledby="administration-actions-title">
      <div className="section-header administration-actions__header">
        <div>
          <p className="eyebrow">Acciones rápidas</p>
          <h3 id="administration-actions-title">Administración del club</h3>
          <p>Accesos preparados para operar las tareas administrativas principales desde este panel.</p>
        </div>
      </div>

      <div className="administration-actions__grid" aria-describedby={feedbackId}>
        {administrationActions.map((action) => {
          const configuredOperation = action.operation ? operation[action.operation] : undefined;
          return (
            <button
              aria-label={`${action.label}. ${action.description}`}
              className={`administration-action-card${action.placeholder ? ' administration-action-card--placeholder' : ''}`}
              key={action.label}
              onClick={() => configuredOperation ? configuredOperation.run() : handlePreparedAction(action)}
              disabled={configuredOperation ? !configuredOperation.enabled : false}
              type="button"
            >
              <span className="administration-action-card__icon" aria-hidden="true">{action.icon}</span>
              <span className="administration-action-card__content">
                <span className="administration-action-card__title">
                  <strong>{action.label}</strong>
                  {action.placeholder && <span className="administration-action-card__badge">Próximamente</span>}
                </span>
                <small>{action.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      {!props.canCreateMovement&&<p className="administration-actions__feedback">No tenés permiso para cargar movimientos.</p>}{!props.canCreateEnrollment&&<p className="administration-actions__feedback">No tenés permiso para cargar inscripciones.</p>}<p className="administration-actions__feedback" id={feedbackId} role="status" aria-live="polite">
        {feedbackMessage}
      </p>
    </section>
  );
}
