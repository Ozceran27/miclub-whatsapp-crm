import type { AdministrationActivityDto, AdministrationSectorDto } from '@miclub/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import {
  createAdministrationActivity, getActivityFormCatalogs, updateAdministrationActivity,
  type ActivityIconCatalogItem, type ActivityInstructorCatalogItem, type AdministrationActivityMutation,
} from '../../services/api/administrationApi';

const iconGlyphs: Record<string, string> = { football: '⚽', basketball: '🏀', volleyball: '🏐', tennis: '🎾', swimming: '🏊', running: '🏃', cycling: '🚴', gym: '🏋️', weights: '💪', yoga: '🧘', pilates: '🤸', dance: '💃', 'martial-arts': '🥋', boxing: '🥊', hockey: '🏑', rugby: '🏉', skating: '⛸️', handball: '🤾', gymnastics: '🤸‍♀️', other: '⭐' };

type Props = { activity?: AdministrationActivityDto; onClose: () => void; onSaved: () => void };

export function ActivityCreateEditModal({ activity, onClose, onSaved }: Props) {
  const [sectors, setSectors] = useState<AdministrationSectorDto[]>([]);
  const [instructors, setInstructors] = useState<ActivityInstructorCatalogItem[]>([]);
  const [icons, setIcons] = useState<ActivityIconCatalogItem[]>([]);
  const [mode, setMode] = useState<'FIXED' | 'VARIABLE'>(activity?.settlementMode?.toUpperCase() === 'VARIABLE' ? 'VARIABLE' : 'FIXED');
  const [iconKey, setIconKey] = useState(activity?.iconKey ?? 'other');
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getActivityFormCatalogs(controller.signal).then((catalogs) => {
      setSectors(catalogs.sectors); setInstructors(catalogs.instructors); setIcons(catalogs.icons);
      if (!activity?.iconKey && catalogs.icons[0]) setIconKey(catalogs.icons[0].iconKey);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los catálogos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCatalogs(false); });
    return () => controller.abort();
  }, [activity?.iconKey]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(null);
    const data = new FormData(event.currentTarget);
    const number = (name: string) => Number(data.get(name) || 0);
    const input: AdministrationActivityMutation = {
      sectorId: String(data.get('sectorId')), instructorId: String(data.get('instructorId')),
      name: String(data.get('name')).trim(), code: String(data.get('code') || '').trim() || null,
      modality: String(data.get('modality') || '').trim() || null, color: String(data.get('color')), iconKey,
      maxCapacity: data.get('maxCapacity') ? number('maxCapacity') : null,
      status: String(data.get('status')) as 'active' | 'inactive', notes: String(data.get('notes') || '').trim() || null,
      settlement: mode === 'FIXED'
        ? { mode, fixedClubFee: number('fixedClubFee'), fixedFeeFrequency: String(data.get('fixedFeeFrequency')) as 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY', currencyCode: String(data.get('currencyCode')) as 'ARS'|'USD'|'BRL'|'EUR', clubSharePercentage: null, effectiveFrom: String(data.get('effectiveFrom')) }
        : { mode, fixedClubFee: null, fixedFeeFrequency: null, currencyCode: null, clubSharePercentage: number('clubSharePercentage'), effectiveFrom: String(data.get('effectiveFrom')) },
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

  return <div className="sector-modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="sector-modal activity-form-modal" role="dialog" aria-modal="true" aria-labelledby="activity-form-title">
      <header className="sector-modal__header"><div><p className="eyebrow">Actividades</p><h2 id="activity-form-title">{activity ? 'Editar actividad' : 'Crear Nueva Actividad'}</h2><p>Definí la liquidación del club. La cuota del socio se configura en el flujo de inscripciones.</p></div><button className="sector-modal__close" type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></header>
      {error && <p className="activity-form__error" role="alert">{error}</p>}
      {loadingCatalogs ? <p role="status">Cargando sectores, instructores e iconos…</p> : <form className="activity-form" onSubmit={(event) => void submit(event)}>
        <div className="activity-form__grid">
          <label>Nombre<input name="name" required defaultValue={activity?.name} /></label>
          <label>Código<input name="code" defaultValue={activity?.code ?? ''} /></label>
          <label>Sector responsable<select name="sectorId" required defaultValue={activity?.sectorId ?? ''}><option value="" disabled>Seleccionar sector…</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label>Instructor responsable<select name="instructorId" required defaultValue={activity?.instructorId ?? ''}><option value="" disabled>Seleccionar instructor…</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.displayName}</option>)}</select></label>
          <label>Modalidad<input name="modality" defaultValue={activity?.modality ?? ''} /></label>
          <label>Estado<select name="status" defaultValue={activity?.status === 'active' ? 'active' : 'inactive'}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
          <label>Cupo máximo<input name="maxCapacity" type="number" min="0" step="1" defaultValue={activity?.maxCapacity ?? ''} /></label>
          <label>Color<input name="color" type="color" defaultValue={activity?.color ?? '#2563EB'} /></label>
        </div>
        <fieldset className="activity-form__terms"><legend>Condiciones de liquidación</legend><label><input type="radio" name="termsMode" checked={mode === 'FIXED'} onChange={() => setMode('FIXED')} /> Monto fijo para el club</label><label><input type="radio" name="termsMode" checked={mode === 'VARIABLE'} onChange={() => setMode('VARIABLE')} /> Porcentaje del club</label>{mode === 'FIXED' ? <> <label>Monto fijo<input name="fixedClubFee" type="number" min="0" step="0.01" required defaultValue={activity?.settlementFixedAmount ?? 0} /></label><label>Moneda<select name="currencyCode"><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label><label>Frecuencia<select name="fixedFeeFrequency"><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></> : <label>Porcentaje del club<input name="clubSharePercentage" type="number" min="0" max="100" step="0.01" required defaultValue={activity?.clubSharePercentage ?? 0} /></label>}<label>Vigente desde<input name="effectiveFrom" type="date" required defaultValue={activity?.termsEffectiveFrom ?? new Date().toISOString().slice(0, 10)} /></label></fieldset>
        <fieldset className="activity-form__icons"><legend>Icono de la actividad</legend>{icons.map((icon) => <button key={icon.iconKey} type="button" data-selected={iconKey === icon.iconKey} aria-pressed={iconKey === icon.iconKey} title={icon.displayName} onClick={() => setIconKey(icon.iconKey)}><span aria-hidden="true">{iconGlyphs[icon.iconKey] ?? '⭐'}</span><small>{icon.displayName}</small></button>)}</fieldset>
        <label>Notas<textarea name="notes" rows={3} defaultValue={activity?.notes ?? ''} /></label>
        <footer className="movement-form__actions"><button className="ghost-btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : activity ? 'Guardar cambios' : 'Crear actividad'}</button></footer>
      </form>}
    </div>
  </div>;
}
