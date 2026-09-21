import { DEFAULT_ACTIVITY_ICON_KEY, type AdministrationActivityDto, type AdministrationSectorDto } from '@miclub/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import {
  createAdministrationActivity, getActivityFormCatalogs, updateAdministrationActivity,
  type ActivityWorkerCatalogItem, type AdministrationActivityMutation,
} from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { ActivityIconPicker, ConfigurationColorPicker } from '../shared/ConfigurationVisualFields';
import { NumberInput } from '../Onboarding/MoneyInput';

type Props = { activity?: AdministrationActivityDto; onClose: () => void; onSaved: () => void };

export function ActivityCreateEditModal({ activity, onClose, onSaved }: Props) {
  const [sectors, setSectors] = useState<AdministrationSectorDto[]>([]);
  const [workers, setWorkers] = useState<ActivityWorkerCatalogItem[]>([]);
  const [mode, setMode] = useState<'FIXED' | 'VARIABLE'>(activity?.settlementMode?.toUpperCase() === 'FIXED' ? 'FIXED' : 'VARIABLE');
  const [currency, setCurrency] = useState<'ARS'|'USD'|'BRL'|'EUR'>((activity?.currencyCode as 'ARS'|'USD'|'BRL'|'EUR'|null) ?? 'ARS');
  const [iconKey, setIconKey] = useState(activity?.iconKey ?? DEFAULT_ACTIVITY_ICON_KEY);
  const [color, setColor] = useState(activity?.color ?? '#2563EB');
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getActivityFormCatalogs(controller.signal).then((catalogs) => {
      setSectors(catalogs.sectors); setWorkers(catalogs.workers);
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
      sectorId: field('sectorId'), responsibleEmployeeId: field('responsibleEmployeeId'), economicResponsiblePersonId: field('economicResponsiblePersonId') || null,
      name: field('name').trim(), code: field('code').trim() || null,
      modality: field('modality').trim() || null, color, iconKey,
      maxCapacity: data.get('maxCapacity') ? number('maxCapacity') : null,
      status: field('status') as 'active' | 'inactive', notes: field('notes').trim() || null,
      settlement: mode === 'FIXED'
        ? { mode, fixedClubFee: number('fixedClubFee'), fixedFeeFrequency: field('fixedFeeFrequency') as 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY', currencyCode: currency, clubSharePercentage: null, effectiveFrom: field('effectiveFrom') }
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
      {loadingCatalogs ? <p role="status">Cargando sectores y trabajadores…</p> : <form id="administration-activity-form" className="draft-form activity-form" onSubmit={(event) => void submit(event)}>
        <div className="draft-form__grid">
          <label>Nombre<input name="name" required defaultValue={activity?.name} /></label>
          <label>Sector responsable<select name="sectorId" required defaultValue={activity?.sectorId ?? ''}><option value="" disabled>Seleccionar sector…</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label>Responsable operativo<select name="responsibleEmployeeId" required defaultValue={activity?.responsibleEmployeeId ?? ''}><option value="" disabled>Seleccionar trabajador…</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.role ?? 'TRABAJADOR'}</option>)}</select></label>
          <label>Estado<select name="status" defaultValue={activity?.status === 'active' ? 'active' : 'inactive'}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
        </div>
        <fieldset className="activity-form__terms">
          <legend>Condiciones económicas</legend>
          <div className="activity-terms__modes" role="radiogroup" aria-label="Modalidad económica">
            <label className={`activity-terms__mode${mode === 'VARIABLE' ? ' activity-terms__mode--selected' : ''}`}><input type="radio" name="termsMode" checked={mode === 'VARIABLE'} onChange={() => setMode('VARIABLE')} /><span><strong>Porcentaje del club</strong><small>Distribución porcentual de cada ingreso.</small></span></label>
            <label className={`activity-terms__mode${mode === 'FIXED' ? ' activity-terms__mode--selected' : ''}`}><input type="radio" name="termsMode" checked={mode === 'FIXED'} onChange={() => setMode('FIXED')} /><span><strong>Monto fijo para el club</strong><small>Importe contractual por período.</small></span></label>
          </div>
          <div className={`activity-terms__details activity-terms__details--${mode.toLowerCase()}`}>
            {mode === 'FIXED' ? <>
              <label className="activity-terms__amount"><span>Monto fijo</span><NumberInput prefix={currency} name="fixedClubFee" min="0" step="0.01" required defaultValue={activity?.settlementFixedAmount ?? 0} /></label>
              <label><span>Moneda</span><select name="currencyCode" value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label>
              <label><span>Frecuencia</span><select name="fixedFeeFrequency" defaultValue={activity?.fixedFeeFrequency ?? 'MONTHLY'}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label>
            </> : <label className="activity-terms__percentage"><span>Porcentaje del club</span><NumberInput suffix="%" name="clubSharePercentage" min="0" max="100" step="0.01" required defaultValue={activity?.clubSharePercentage ?? 0} /><small>El club conserva este porcentaje; el restante corresponde al receptor económico.</small></label>}
            <label className="activity-terms__effective"><span>Vigente desde</span><input name="effectiveFrom" type="date" required defaultValue={activity?.termsEffectiveFrom ?? new Date().toISOString().slice(0, 10)} /></label>
          </div>
        </fieldset>
        <ConfigurationColorPicker value={color} onChange={setColor} label="Color de la actividad" />
        <ActivityIconPicker value={iconKey} onChange={setIconKey} />
        <fieldset><legend>Configuración avanzada</legend><div className="draft-form__grid"><label>Código<input name="code" defaultValue={activity?.code ?? ''} /></label><label>Receptor económico<select name="economicResponsiblePersonId" defaultValue={activity?.responsiblePersonId && activity.responsiblePersonId !== workers.find(worker => worker.id === activity.responsibleEmployeeId)?.personId ? activity.responsiblePersonId : ''}><option value="">Seguir automáticamente al responsable operativo</option>{workers.map((worker) => <option key={worker.personId} value={worker.personId}>{worker.displayName}</option>)}</select></label><label>Modalidad operativa<input name="modality" defaultValue={activity?.modality ?? ''} /></label><label>Cupo máximo<input name="maxCapacity" type="number" min="0" step="1" defaultValue={activity?.maxCapacity ?? ''} /></label></div><label>Notas<textarea name="notes" rows={3} defaultValue={activity?.notes ?? ''} /></label></fieldset>
      </form>}
  </ConfigurationEditorModal>;
}
