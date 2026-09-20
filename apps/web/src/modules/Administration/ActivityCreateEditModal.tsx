import { DEFAULT_ACTIVITY_ICON_KEY, type AdministrationActivityDto, type AdministrationSectorDto } from '@miclub/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import {
  createAdministrationActivity, getActivityFormCatalogs, updateAdministrationActivity,
  type ActivityInstructorCatalogItem, type AdministrationActivityMutation,
} from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { ActivityIconPicker, ConfigurationColorPicker } from '../shared/ConfigurationVisualFields';

type Props = { activity?: AdministrationActivityDto; onClose: () => void; onSaved: () => void };

export function ActivityCreateEditModal({ activity, onClose, onSaved }: Props) {
  const [sectors, setSectors] = useState<AdministrationSectorDto[]>([]);
  const [instructors, setInstructors] = useState<ActivityInstructorCatalogItem[]>([]);
  const [responsibles, setResponsibles] = useState<Array<{id:string;name:string}>>([]);
  const [mode, setMode] = useState<'FIXED' | 'VARIABLE'>(activity?.settlementMode?.toUpperCase() === 'FIXED' ? 'FIXED' : 'VARIABLE');
  const [iconKey, setIconKey] = useState(activity?.iconKey ?? DEFAULT_ACTIVITY_ICON_KEY);
  const [color, setColor] = useState(activity?.color ?? '#2563EB');
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getActivityFormCatalogs(controller.signal).then((catalogs) => {
      setSectors(catalogs.sectors); setInstructors(catalogs.instructors); setResponsibles(catalogs.responsibles);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los catálogos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCatalogs(false); });
    return () => controller.abort();
  }, [activity?.iconKey]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(null);
    const data = new FormData(event.currentTarget);
    const field = (name: string) => { const value = data.get(name); return typeof value === 'string' ? value : ''; };
    const number = (name: string) => Number(data.get(name) || 0);
    const input: AdministrationActivityMutation = {
      sectorId: field('sectorId'), instructorId: field('instructorId'), responsiblePersonId: field('responsiblePersonId') || null,
      name: field('name').trim(), code: field('code').trim() || null,
      modality: field('modality').trim() || null, color, iconKey,
      maxCapacity: data.get('maxCapacity') ? number('maxCapacity') : null,
      status: field('status') as 'active' | 'inactive', notes: field('notes').trim() || null,
      settlement: mode === 'FIXED'
        ? { mode, fixedClubFee: number('fixedClubFee'), fixedFeeFrequency: field('fixedFeeFrequency') as 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY', currencyCode: field('currencyCode') as 'ARS'|'USD'|'BRL'|'EUR', clubSharePercentage: null, effectiveFrom: field('effectiveFrom') }
        : { mode, fixedClubFee: null, fixedFeeFrequency: null, currencyCode: null, clubSharePercentage: number('clubSharePercentage'), effectiveFrom: field('effectiveFrom') },
    };
    try {
      if (activity) await updateAdministrationActivity(activity.id, activity.updatedAt, input);
      else await createAdministrationActivity(input);
      onSaved();
    } catch (reason) {
      const concurrency = reason instanceof ApiError && reason.status === 409 && reason.code === 'OPTIMISTIC_CONCURRENCY_CONFLICT';
      setError(concurrency ? 'Otra persona modificó esta actividad. Cerrá el formulario, actualizá la lista e intentá nuevamente.' : reason instanceof Error ? reason.message : 'No se pudo guardar la actividad.');
    } finally { setSaving(false); }
  };

  return <ConfigurationEditorModal
    size="large"
    eyebrow="Actividades"
    title={activity ? 'Editar actividad' : 'Agregar Nueva Actividad'}
    description="Definí la operación y las condiciones económicas sin modificar la historia ya liquidada."
    busy={saving}
    onClose={onClose}
    footer={!loadingCatalogs ? <><button className="ghost-btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-btn" type="submit" form="administration-activity-form" disabled={saving}>{saving ? 'Guardando…' : activity ? 'Guardar cambios' : 'Crear actividad'}</button></> : undefined}
  >
      {error && <p className="activity-form__error" role="alert">{error}</p>}
      {loadingCatalogs ? <p role="status">Cargando sectores e instructores…</p> : <form id="administration-activity-form" className="draft-form activity-form" onSubmit={(event) => void submit(event)}>
        <div className="draft-form__grid">
          <label>Nombre<input name="name" required defaultValue={activity?.name} /></label>
          <label>Sector responsable<select name="sectorId" required defaultValue={activity?.sectorId ?? ''}><option value="" disabled>Seleccionar sector…</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label>Instructor responsable<select name="instructorId" required defaultValue={activity?.instructorId ?? ''}><option value="" disabled>Seleccionar instructor…</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.displayName}</option>)}</select></label>
          <label>Estado<select name="status" defaultValue={activity?.status === 'active' ? 'active' : 'inactive'}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
        </div>
        <fieldset className="activity-form__terms"><legend>Condiciones económicas</legend><label><input type="radio" name="termsMode" checked={mode === 'VARIABLE'} onChange={() => setMode('VARIABLE')} /> Porcentaje del club</label><label><input type="radio" name="termsMode" checked={mode === 'FIXED'} onChange={() => setMode('FIXED')} /> Monto fijo para el club</label>{mode === 'FIXED' ? <> <label>Monto fijo<input name="fixedClubFee" type="number" min="0" step="0.01" required defaultValue={activity?.settlementFixedAmount ?? 0} /></label><label>Moneda<select name="currencyCode" defaultValue={activity?.currencyCode ?? 'ARS'}><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label><label>Frecuencia<select name="fixedFeeFrequency" defaultValue={activity?.fixedFeeFrequency ?? 'MONTHLY'}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></> : <label>Porcentaje del club<input name="clubSharePercentage" type="number" min="0" max="100" step="0.01" required defaultValue={activity?.clubSharePercentage ?? 0} /><small>El club conserva este porcentaje; el resto corresponde al responsable.</small></label>}<label>Vigente desde<input name="effectiveFrom" type="date" required defaultValue={activity?.termsEffectiveFrom ?? new Date().toISOString().slice(0, 10)} /></label></fieldset>
        <ConfigurationColorPicker value={color} onChange={setColor} label="Color de la actividad" />
        <ActivityIconPicker value={iconKey} onChange={setIconKey} />
        <fieldset><legend>Configuración avanzada</legend><div className="draft-form__grid"><label>Código<input name="code" defaultValue={activity?.code ?? ''} /></label><label>Receptor económico<select name="responsiblePersonId" defaultValue={activity?.responsiblePersonId ?? ''}><option value="">Usar la persona del instructor</option>{responsibles.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Modalidad operativa<input name="modality" defaultValue={activity?.modality ?? ''} /></label><label>Cupo máximo<input name="maxCapacity" type="number" min="0" step="1" defaultValue={activity?.maxCapacity ?? ''} /></label></div><label>Notas<textarea name="notes" rows={3} defaultValue={activity?.notes ?? ''} /></label></fieldset>
      </form>}
  </ConfigurationEditorModal>;
}
