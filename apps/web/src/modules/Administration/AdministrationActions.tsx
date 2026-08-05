import { useId, useState } from 'react';

type AdministrationAction = {
  label: string;
  description: string;
  icon: string;
};

const preparedFeedback = 'Funcionalidad preparada para una próxima fase';

const administrationActions: AdministrationAction[] = [
  { label: 'Cargar Movimiento', description: 'Registrar ingresos, egresos o ajustes administrativos del club.', icon: '↕' },
  { label: 'Cargar Inscripción', description: 'Iniciar el alta de una persona en una actividad o plan.', icon: '📝' },
  { label: 'Cargar Cuota', description: 'Gestionar la carga de cuotas y vencimientos asociados.', icon: '💳' },
  { label: 'Crear Reserva', description: 'Preparar una reserva de sector, espacio o recurso operativo.', icon: '📅' },
  { label: 'Cargar Socio', description: 'Dar de alta o actualizar los datos principales de un socio.', icon: '👤' },
  { label: 'Gestionar Sectores', description: 'Administrar sectores, cupos y metadatos visibles del club.', icon: '🏟️' },
  { label: 'Gestionar Categorías', description: 'Organizar categorías administrativas para clasificar operaciones.', icon: '🏷️' },
  { label: 'Gestionar Trabajadores', description: 'Mantener trabajadores, roles y responsabilidades operativas.', icon: '🧑‍💼' },
  { label: 'Gestionar Actividades', description: 'Editar actividades, oferta vigente y configuración asociada.', icon: '⭐' },
  { label: 'Gestionar Membresías', description: 'Configurar membresías, planes y condiciones comerciales.', icon: '🎟️' }
];

export function AdministrationActions() {
  const feedbackId = useId();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handlePreparedAction = (label: string) => {
    setSelectedAction(label);
  };

  const feedbackMessage = selectedAction ? `${selectedAction}: ${preparedFeedback}.` : 'Seleccioná una acción administrativa para continuar.';

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
            className="administration-action-card"
            key={action.label}
            onClick={() => handlePreparedAction(action.label)}
            type="button"
          >
            <span className="administration-action-card__icon" aria-hidden="true">{action.icon}</span>
            <span className="administration-action-card__content">
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </span>
          </button>
        ))}
      </div>

      <p className="administration-actions__feedback" id={feedbackId} role="status" aria-live="polite">
        {feedbackMessage}
      </p>
    </section>
  );
}
