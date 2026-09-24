import { areActivitySchedulesValid, DEFAULT_ACTIVITY_ICON_KEY, type ActivityScheduleBlock, type AdministrationActivityDto } from '@miclub/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import { createAdministrationActivity, getActivityFormCatalogs, getActivityPriceHistory, getActivityTermHistory, updateAdministrationActivity, type ActivityPriceHistoryItem, type ActivitySectorCatalogItem, type ActivityTermHistoryItem, type ActivityWorkerCatalogItem, type AdministrationActivityMutation } from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { ActivityIconPicker, ConfigurationColorPicker } from '../shared/ConfigurationVisualFields';
import { FormattedValueInput } from '../shared/FormattedValueInput';
import { ActivityScheduleEditor } from '../shared/ActivityScheduleEditor';
import { describeActivityTerms, formatActivityCivilDate, formatFrequency, formatMoney } from './activityPresentation';

type Props = { activity?: AdministrationActivityDto; onClose: () => void; onSaved: () => void };
const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (value: string) => { const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10); };

export function ActivityCreateEditModal({ activity, onClose, onSaved }: Props) {
  const activityId=activity?.id;
  const [sectors, setSectors] = useState<ActivitySectorCatalogItem[]>([]);
  const [workers, setWorkers] = useState<ActivityWorkerCatalogItem[]>([]);
  const [terms, setTerms] = useState<ActivityTermHistoryItem[]>([]);
  const [prices,setPrices]=useState<ActivityPriceHistoryItem[]>([]);
  const [priceCurrency,setPriceCurrency]=useState(activity?.operatingCurrencyCode??'ARS');
  const [editPrices,setEditPrices]=useState(!activity || !activity.pricingConfigured);
  const [schedules,setSchedules]=useState<ActivityScheduleBlock[]>(activity?.schedules?.map(({weekday,startTime,endTime})=>({weekday,startTime,endTime}))??[]);
  const [mode, setMode] = useState<'FIXED' | 'VARIABLE'>(activity?.settlementMode?.toUpperCase() === 'FIXED' ? 'FIXED' : 'VARIABLE');
  const [currency, setCurrency] = useState<'ARS'|'USD'|'BRL'|'EUR'>((activity?.currencyCode as 'ARS'|'USD'|'BRL'|'EUR'|null) ?? 'ARS');
  const [iconKey, setIconKey] = useState(activity?.iconKey ?? DEFAULT_ACTIVITY_ICON_KEY);
  const [color, setColor] = useState(activity?.color ?? '#2563EB');
  const [generatesEnrollments, setGeneratesEnrollments] = useState<boolean|null>(activity?.generatesEnrollments ?? null);
  const [editTerms, setEditTerms] = useState(!activity);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const termRequest = activityId ? getActivityTermHistory(activityId, controller.signal) : Promise.resolve({ items: [] });
    const priceRequest = activityId ? getActivityPriceHistory(activityId,controller.signal) : Promise.resolve({items:[]});
    Promise.all([getActivityFormCatalogs(controller.signal), termRequest,priceRequest]).then(([catalogs, history,priceHistory]) => {
      setSectors(catalogs.sectors); setWorkers(catalogs.workers); setTerms(history.items);
      setPrices(priceHistory.items);setPriceCurrency(catalogs.currencyCode);
      const latest=history.items[0];
      if(latest){setMode(latest.mode);if(latest.currencyCode)setCurrency(latest.currencyCode as typeof currency);}
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los catálogos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCatalogs(false); });
    return () => controller.abort();
  }, [activityId]);

  const latestTerm=terms[0];
  const effectiveDefault=useMemo(()=>latestTerm?nextDay(latestTerm.effectiveFrom):today(),[latestTerm]);
  const latestPrice=prices.find(price=>!price.cancelledAt&&price.effectiveFrom<=today())??prices.find(price=>!price.cancelledAt);
  const priceEffectiveDefault=today();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    if(generatesEnrollments===null){setError('Elegí explícitamente si la actividad admite inscripciones.');return;}
    const data = new FormData(event.currentTarget);
    const field = (name: string) => { const value = data.get(name); return typeof value === 'string' ? value : ''; };
    const number = (name: string) => Number(data.get(name) || 0);
    if(generatesEnrollments&&(!activity||editPrices) && (!Number.isSafeInteger(number('enrollmentPrice'))||number('enrollmentPrice')<0||!Number.isSafeInteger(number('feePrice'))||number('feePrice')<0)){setError('Los precios deben ser importes enteros no negativos.');return;}
    if(!areActivitySchedulesValid(schedules)){setError('Revisá los horarios: cada bloque debe terminar el mismo día y no puede superponerse con otro.');return;}
    if((!activity||editTerms)&&mode==='VARIABLE'&&(number('clubSharePercentage')<0||number('clubSharePercentage')>100)){setError('El porcentaje del club debe estar entre 0 y 100%.');return;}
    setSaving(true);
    const includeTerms=!activity||editTerms;
    const input: AdministrationActivityMutation = {
      sectorId: field('sectorId'), responsibleEmployeeId: field('responsibleEmployeeId'),
      ...(includeTerms ? { economicResponsiblePersonId: field('economicResponsiblePersonId') || null } : {}),
      name: field('name').trim(), code: field('code').trim() || null, modality: field('modality').trim() || null,
      color, iconKey, maxCapacity: data.get('maxCapacity') ? number('maxCapacity') : null, generatesEnrollments,
      status: field('status') as 'active' | 'inactive', notes: field('notes').trim() || null,
       ...(includeTerms ? { settlement: mode === 'FIXED'
        ? { mode, fixedClubFee: number('fixedClubFee'), fixedFeeFrequency: field('fixedFeeFrequency') as 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY', currencyCode: currency, clubSharePercentage: null, effectiveFrom: field('effectiveFrom') }
         : { mode, fixedClubFee: null, fixedFeeFrequency: null, currencyCode: null, clubSharePercentage: number('clubSharePercentage'), effectiveFrom: field('effectiveFrom') } } : {}),
       ...(generatesEnrollments&&(!activity||editPrices)?{pricing:{enrollmentPrice:number('enrollmentPrice'),feePrice:number('feePrice'),feeFrequency:field('feeFrequency') as 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY',effectiveFrom:field('priceEffectiveFrom')}}:{}),
       schedules,
    };
    try { if (activity) await updateAdministrationActivity(activity.id, activity.updatedAt, input); else await createAdministrationActivity(input); onSaved(); }
    catch (reason) { const concurrency = reason instanceof ApiError && reason.status === 409 && reason.code === 'OPTIMISTIC_CONCURRENCY_CONFLICT'; setError(concurrency ? 'Otra persona modificó esta actividad. Cerrá el formulario, actualizá la lista e intentá nuevamente.' : reason instanceof Error ? reason.message : 'No se pudo guardar la actividad.'); }
    finally { setSaving(false); }
  };

  return <ConfigurationEditorModal size="large" eyebrow="Actividades" title={activity ? 'Editar actividad' : 'Agregar Nueva Actividad'} description="Definí la operación y versioná las condiciones económicas sin alterar su historia." busy={saving} onClose={onClose}
    footer={!loadingCatalogs ? <><button className="ghost-btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-btn" type="submit" form="administration-activity-form" disabled={saving}>{saving ? 'Guardando…' : activity ? 'Guardar cambios' : 'Crear actividad'}</button></> : undefined}>
    {error && <p className="activity-form__error" role="alert">{error}</p>}
    {loadingCatalogs ? <p role="status">Cargando sectores, trabajadores y vigencias…</p> : <form id="administration-activity-form" className="draft-form activity-form" onSubmit={event=>void submit(event)}>
      <fieldset><legend>Información operativa</legend><div className="draft-form__grid">
        <label>Nombre<input name="name" required defaultValue={activity?.name} /></label><label>Sector responsable<select name="sectorId" required defaultValue={activity?.sectorId ?? ''}><option value="" disabled>Seleccionar sector…</option>{sectors.map(sector=><option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
        <label>Responsable operativo<select name="responsibleEmployeeId" required defaultValue={activity?.responsibleEmployeeId ?? ''}><option value="" disabled>Seleccionar trabajador…</option>{workers.map(worker=><option key={worker.id} value={worker.id}>{worker.displayName} · {worker.role ?? 'TRABAJADOR'}</option>)}</select></label><label>Estado<select name="status" defaultValue={activity?.status === 'active' ? 'active' : 'inactive'}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
      </div></fieldset>
      <fieldset><legend>Inscripciones</legend><div className="activity-terms__modes" role="radiogroup" aria-label="¿Admite inscripciones?"><label className={`activity-terms__mode${generatesEnrollments===true?' activity-terms__mode--selected':''}`}><input type="radio" name="generatesEnrollments" required checked={generatesEnrollments===true} onChange={()=>setGeneratesEnrollments(true)}/><span><strong>Sí, admite inscripciones</strong><small>Podrá seleccionarse al registrar nuevos inscriptos.</small></span></label><label className={`activity-terms__mode${generatesEnrollments===false?' activity-terms__mode--selected':''}`}><input type="radio" name="generatesEnrollments" required checked={generatesEnrollments===false} onChange={()=>setGeneratesEnrollments(false)}/><span><strong>No admite inscripciones</strong><small>Conserva la historia y bloquea nuevas altas.</small></span></label></div></fieldset>
      {generatesEnrollments&&activity&&!editPrices&&<section className="activity-form__current-terms"><div><small>Precios vigentes</small><strong>Inscripción {formatMoney(activity.enrollmentPrice??0,priceCurrency)} · Cuota {formatMoney(activity.feePrice??0,priceCurrency)} / {formatFrequency(activity.feeFrequency)}</strong></div><button type="button" className="ghost-btn" onClick={()=>setEditPrices(true)}>Programar nuevos precios</button></section>}
      {generatesEnrollments&&editPrices&&<fieldset><legend>Precios para alumnos</legend>{activity&&!activity.pricingConfigured&&<p className="activity-form__history-note">Sin configurar. Definí precios vigentes antes de habilitar nuevas inscripciones.</p>}<div className="activity-prices__grid"><label>Inscripción<FormattedValueInput kind="money" currency={priceCurrency} name="enrollmentPrice" required defaultValue={latestPrice?.enrollmentPrice??activity?.enrollmentPrice??0}/></label><label>Cuota<FormattedValueInput kind="money" currency={priceCurrency} name="feePrice" required defaultValue={latestPrice?.feePrice??activity?.feePrice??0}/></label><label>Frecuencia<select name="feeFrequency" defaultValue={latestPrice?.feeFrequency??activity?.feeFrequency??'MONTHLY'}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label><label>Vigente desde<input type="date" name="priceEffectiveFrom" required defaultValue={priceEffectiveDefault}/></label></div><small>Moneda base del club: {priceCurrency}. Elegí cualquier fecha sin una vigencia que comience ese día; las inscripciones guardadas conservan sus importes.</small>{activity?.pricingConfigured&&<button type="button" className="ghost-btn" onClick={()=>setEditPrices(false)}>Conservar precios actuales</button>}</fieldset>}
      {activity&&!editTerms&&<section className="activity-form__current-terms"><div><small>Condiciones vigentes</small><strong>{describeActivityTerms(activity)}</strong><span>Desde {formatActivityCivilDate(activity.termsEffectiveFrom)}</span></div><button type="button" className="ghost-btn" onClick={()=>setEditTerms(true)}>Programar nuevas condiciones</button></section>}
      {editTerms&&<fieldset className="activity-form__terms"><legend>{activity?'Nuevas condiciones económicas':'Condiciones económicas'}</legend>{activity&&<p className="activity-form__history-note">La vigencia actual no se modifica. Al guardar se cerrará el término anterior y se creará una nueva versión.</p>}<div className="activity-terms__modes" role="radiogroup" aria-label="Modalidad económica"><label className={`activity-terms__mode${mode==='VARIABLE'?' activity-terms__mode--selected':''}`}><input type="radio" name="termsMode" checked={mode==='VARIABLE'} onChange={()=>setMode('VARIABLE')}/><span><strong>Porcentaje del club</strong><small>Distribución porcentual de cada ingreso.</small></span></label><label className={`activity-terms__mode${mode==='FIXED'?' activity-terms__mode--selected':''}`}><input type="radio" name="termsMode" checked={mode==='FIXED'} onChange={()=>setMode('FIXED')}/><span><strong>Monto fijo para el club</strong><small>Importe contractual por período.</small></span></label></div>
        <div className={`activity-terms__details activity-terms__details--${mode.toLowerCase()}`}>{mode==='FIXED'?<><label className="activity-terms__amount"><span>Monto fijo</span><FormattedValueInput kind="money" currency={currency} name="fixedClubFee" required defaultValue={latestTerm?.fixedClubFee??activity?.settlementFixedAmount??0}/></label><label><span>Moneda</span><select name="currencyCode" value={currency} onChange={event=>setCurrency(event.target.value as typeof currency)}><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label><label><span>Frecuencia</span><select name="fixedFeeFrequency" defaultValue={latestTerm?.fixedFeeFrequency??activity?.fixedFeeFrequency??'MONTHLY'}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></>:<label className="activity-terms__percentage"><span>Porcentaje del club</span><FormattedValueInput kind="percent" name="clubSharePercentage" required defaultValue={latestTerm?.clubSharePercentage??activity?.clubSharePercentage??0}/><small>El restante corresponde al receptor económico.</small></label>}<label><span>Receptor económico</span><select name="economicResponsiblePersonId" defaultValue={latestTerm?.responsiblePersonId??activity?.responsiblePersonId??''}><option value="">Seguir al responsable operativo</option>{workers.map(worker=><option key={worker.personId} value={worker.personId}>{worker.displayName}</option>)}</select></label><label className="activity-terms__effective"><span>{activity?'Nueva vigencia desde':'Vigente desde'}</span><input name="effectiveFrom" type="date" required min={activity?effectiveDefault:undefined} defaultValue={activity?effectiveDefault:today()} /></label></div>{activity&&<button type="button" className="ghost-btn" onClick={()=>setEditTerms(false)}>Conservar condiciones actuales</button>}
       </fieldset>}
      <fieldset><legend>Días y horarios</legend><ActivityScheduleEditor value={schedules} onChange={setSchedules}/></fieldset>
      <fieldset><legend>Apariencia</legend><ConfigurationColorPicker value={color} onChange={setColor} label="Color de la actividad" /><ActivityIconPicker value={iconKey} onChange={setIconKey} /></fieldset>
      <fieldset><legend>Configuración avanzada</legend><div className="activity-form__advanced"><label>Código<input name="code" defaultValue={activity?.code ?? ''} /></label><label>Modalidad operativa<input name="modality" defaultValue={activity?.modality ?? ''} /></label><label>Cupo máximo<input name="maxCapacity" type="number" min="0" step="1" defaultValue={activity?.maxCapacity ?? ''} /></label></div><label>Notas<textarea name="notes" rows={3} defaultValue={activity?.notes ?? ''} /></label></fieldset>
    </form>}
  </ConfigurationEditorModal>;
}
