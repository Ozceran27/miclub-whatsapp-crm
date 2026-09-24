import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createAdministrationEnrollment, getEnrollmentFormCatalogs, type EnrollmentCatalogItem } from '../../services/api/administrationApi';
import { FormattedValueInput } from '../shared/FormattedValueInput';
import { useModalAccessibility } from './useModalAccessibility';

type Props={open:boolean;onClose:()=>void;onCreated:()=>void};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
const Field=({label,children}:{label:string;children:ReactNode})=><label className="movement-form__field"><span>{label}</span>{children}</label>;

export function EnrollmentCreateModal({open,onClose,onCreated}:Props){
 const dialogRef=useRef<HTMLElement>(null);
 const [people,setPeople]=useState<EnrollmentCatalogItem[]>([]),[activities,setActivities]=useState<EnrollmentCatalogItem[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useModalAccessibility(dialogRef,open,()=>{if(!busy)onClose()});
 const [selectedActivityId,setSelectedActivityId]=useState('');
 const selectedActivity=activities.find(item=>item.id===selectedActivityId);
 useEffect(()=>{if(!open)return;const c=new AbortController();const timer=window.setTimeout(()=>{setError('');setLoaded(false);void getEnrollmentFormCatalogs(c.signal).then(data=>{if(c.signal.aborted)return;setPeople(data.people);setActivities(data.activities.filter(item=>item.generatesEnrollments!==false&&item.status!=='inactive'));setLoaded(true)}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'No se pudieron cargar los datos reales.')})},0);return()=>{window.clearTimeout(timer);c.abort()}},[open]);
 if(!open)return null;
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{await createAdministrationEnrollment({personId:data.get('personId'),activityId:data.get('activityId'),feeAmount:Number(data.get('feeAmount')),enrollmentPrice:Number(data.get('enrollmentPrice')),status:data.get('status'),dueDate:data.get('dueDate')||null,enrollmentDate:data.get('enrollmentDate')});window.dispatchEvent(new Event('miclub:enrollment-created'));onCreated();onClose()}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la inscripción.')}finally{setBusy(false)}};
 return <div className="sector-modal__backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section ref={dialogRef} tabIndex={-1} className="sector-modal movement-form-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-form-title">
  <header className="sector-modal__header"><div><p className="eyebrow">Socios</p><h2 id="enrollment-form-title">Cargar inscripción</h2><p>Vinculá una persona existente con una actividad real del club.</p></div><button className="sector-modal__close" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar">×</button></header>
  {!loaded&&!error?<p>Cargando personas y actividades…</p>:<form className="movement-form" onSubmit={event=>void submit(event)}><div className="movement-form__grid">
   <Field label="Persona"><select name="personId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{people.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Actividad"><select name="activityId" required value={selectedActivityId} onChange={event=>setSelectedActivityId(event.target.value)}><option value="" disabled>Seleccionar…</option>{activities.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Inscripción"><FormattedValueInput key={`enrollment-${selectedActivityId}`} kind="money" currency={selectedActivity?.currencyCode??'ARS'} name="enrollmentPrice" required defaultValue={selectedActivity?.enrollmentPrice??0}/></Field>
   <Field label="Cuota"><FormattedValueInput key={`fee-${selectedActivityId}`} kind="money" currency={selectedActivity?.currencyCode??'ARS'} name="feeAmount" required defaultValue={selectedActivity?.feePrice??0}/>{selectedActivity&&!selectedActivity.pricingConfigured&&<small>Precio sin configurar: ingresá la cuota manualmente.</small>}</Field><Field label="Estado"><select name="status" defaultValue="nuevo_inscripto"><option value="nuevo_inscripto">Nuevo inscripto</option><option value="al_dia">Al día</option><option value="adeudando">Adeudando</option></select></Field>
   <Field label="Fecha de inscripción"><input name="enrollmentDate" type="date" required defaultValue={today()}/></Field><Field label="Vencimiento (opcional)"><input name="dueDate" type="date"/></Field>
  </div>{error&&<p className="sector-modal__error" role="alert">{error}</p>}<div className="movement-form__actions"><button type="button" className="icon-btn" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="icon-btn home-sync-button" disabled={busy||!loaded}>{busy?'Guardando…':'Registrar inscripción'}</button></div></form>}
 </section></div>
}
