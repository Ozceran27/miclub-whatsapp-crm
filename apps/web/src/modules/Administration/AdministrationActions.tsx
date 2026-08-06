import { useId, useState } from 'react';

type AdministrationAction = {
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
  { label: 'Cargar Movimiento', description: 'Registrar ingresos, egresos o ajustes administrativos del club.', icon: '↕' },
  { label: 'Cargar Inscripción', description: 'Iniciar el alta de una persona en una actividad o plan.', icon: '📝' },
  { label: 'Cargar Cuota', description: 'Gestionar la carga de cuotas y vencimientos asociados.', icon: '💳' },
  {
    label: 'Crear Reserva',
    description: 'Próxima etapa: reservas de espacios y recursos, una vez definidas sus reglas operativas.',
    icon: '📅',
    placeholder: { pendingDefinitions: reservationDefinitions }
  },
  { label: 'Cargar Socio', description: 'Dar de alta o actualizar los datos principales de un socio.', icon: '👤' },
  { label: 'Gestionar Sectores', description: 'Administrar sectores, cupos y metadatos visibles del club.', icon: '🏟️' },
  { label: 'Gestionar Categorías', description: 'Organizar categorías administrativas para clasificar operaciones.', icon: '🏷️' },
  { label: 'Gestionar Trabajadores', description: 'Mantener trabajadores, roles y responsabilidades operativas.', icon: '🧑‍💼' },
  { label: 'Gestionar Actividades', description: 'Editar actividades, oferta vigente y configuración asociada.', icon: '⭐' },
  {
    label: 'Gestionar Membresías',
    description: 'Próxima etapa: planes y condiciones comerciales, luego de validar el modelo integral.',
    icon: '🎟️',
    placeholder: { pendingDefinitions: reservationDefinitions }
  }
];

export function AdministrationActions({onCreateMovement,onCreateEnrollment,canCreateMovement,canCreateEnrollment}:{onCreateMovement:()=>void;onCreateEnrollment:()=>void;canCreateMovement:boolean;canCreateEnrollment:boolean}) {
  const feedbackId = useId();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handlePreparedAction = (action: AdministrationAction) => {
    const detail = action.placeholder
      ? `Disponible en una próxima etapa. Antes se definirán: ${action.placeholder.pendingDefinitions.join(', ')}`
      : preparedFeedback;

    setSelectedAction(`${action.label}: ${detail}`);
  };

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
        {administrationActions.map((action) => (
          <button
            aria-label={`${action.label}. ${action.description}`}
            className={`administration-action-card${action.placeholder ? ' administration-action-card--placeholder' : ''}`}
            key={action.label}
            onClick={() => action.label==='Cargar Movimiento'?onCreateMovement():action.label==='Cargar Inscripción'?onCreateEnrollment():handlePreparedAction(action)}
            disabled={(action.label==='Cargar Movimiento'&&!canCreateMovement)||(action.label==='Cargar Inscripción'&&!canCreateEnrollment)}
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
        ))}
      </div>

      {!canCreateMovement&&<p className="administration-actions__feedback">No tenés el permiso movements.create para cargar movimientos.</p>}{!canCreateEnrollment&&<p className="administration-actions__feedback">No tenés el permiso enrollments.create para cargar inscripciones.</p>}<p className="administration-actions__feedback" id={feedbackId} role="status" aria-live="polite">
        {feedbackMessage}
      </p>
    </section>
  );
}
