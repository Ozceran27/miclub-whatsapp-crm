import type { ChangeEvent } from 'react';

export type SetupFormProps = { disabled?: boolean; onChange?: (values: Record<string, string>) => void };

function useFields(onChange?: SetupFormProps['onChange']) {
  const values: Record<string, string> = {};
  return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    values[event.target.name] = event.target.value;
    onChange?.({ ...values });
  };
}

/** Shared setup surfaces: Administration can embed these forms as well as onboarding. */
export function SectorSetupForm({ disabled, onChange }: SetupFormProps) {
  const change = useFields(onChange);
  return <fieldset className="setup-form" disabled={disabled}><legend>Datos del sector</legend><label>Nombre<input name="name" onChange={change} placeholder="Ej. Natación" /></label><label>Código<input name="code" onChange={change} placeholder="NATACION" /></label><label>¿Usa actividades?<select name="usesActivities" onChange={change} defaultValue="yes"><option value="yes">Sí</option><option value="no">No</option></select></label></fieldset>;
}

export function WorkerSetupForm({ disabled, onChange }: SetupFormProps) {
  const change = useFields(onChange);
  return <fieldset className="setup-form" disabled={disabled}><legend>Datos del trabajador</legend><label>Nombre<input name="displayName" onChange={change} autoComplete="name" /></label><label>Rol<input name="role" onChange={change} placeholder="Ej. Instructor" /></label><label>Correo<input name="email" type="email" onChange={change} autoComplete="email" /></label></fieldset>;
}

export function ActivitySetupForm({ disabled, onChange }: SetupFormProps) {
  const change = useFields(onChange);
  return <fieldset className="setup-form" disabled={disabled}><legend>Datos de la actividad</legend><label>Nombre<input name="name" onChange={change} placeholder="Ej. Yoga" /></label><label>Sector<input name="sector" onChange={change} /></label><label>Cuota mensual<input name="monthlyFee" type="number" min="0" onChange={change} /></label></fieldset>;
}
