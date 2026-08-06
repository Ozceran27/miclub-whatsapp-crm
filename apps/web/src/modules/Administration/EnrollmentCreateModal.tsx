import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createAdministrationEnrollment, getEnrollmentFormCatalogs, type EnrollmentCatalogItem } from '../../services/api/administrationApi';

type Props={open:boolean;onClose:()=>void;onCreated:()=>void};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
const Field=({label,children}:{label:string;children:ReactNode})=><label className="movement-form__field"><span>{label}</span>{children}</label>;

export function EnrollmentCreateModal({open,onClose,onCreated}:Props){
 const [people,setPeople]=useState<EnrollmentCatalogItem[]>([]),[activities,setActivities]=useState<EnrollmentCatalogItem[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!open)return;const c=new AbortController();setError('');setLoaded(false);void getEnrollmentFormCatalogs(c.signal).then(data=>{setPeople(data.people);setActivities(data.activities.filter(item=>item.generatesEnrollments!==false&&item.status!=='inactive'));setLoaded(true)}).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar los datos reales.'));return()=>c.abort()},[open]);
 if(!open)return null;
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{await createAdministrationEnrollment({personId:data.get('personId'),activityId:data.get('activityId'),feeAmount:Number(data.get('feeAmount')),status:data.get('status'),dueDate:data.get('dueDate')||null,enrollmentDate:data.get('enrollmentDate')});window.dispatchEvent(new Event('miclub:enrollment-created'));onCreated();onClose()}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la inscripción.')}finally{setBusy(false)}};
 return <div className="sector-modal__backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sector-modal movement-form-modal" role="dialog" aria-modal="true" aria-labelledby="enrollment-form-title">
  <header className="sector-modal__header"><div><p className="eyebrow">Socios</p><h2 id="enrollment-form-title">Cargar inscripción</h2><p>Vinculá una persona existente con una actividad real del club.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
  {!loaded&&!error?<p>Cargando personas y actividades…</p>:<form className="movement-form" onSubmit={submit}><div className="movement-form__grid">
   <Field label="Persona"><select name="personId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{people.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Actividad"><select name="activityId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{activities.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Cuota"><input name="feeAmount" type="number" min="0" step="0.01" required/></Field><Field label="Estado"><select name="status" defaultValue="nuevo_inscripto"><option value="nuevo_inscripto">Nuevo inscripto</option><option value="al_dia">Al día</option><option value="adeudando">Adeudando</option></select></Field>
   <Field label="Fecha de inscripción"><input name="enrollmentDate" type="date" required defaultValue={today()}/></Field><Field label="Vencimiento (opcional)"><input name="dueDate" type="date"/></Field>
  </div>{error&&<p className="sector-modal__error" role="alert">{error}</p>}<div className="movement-form__actions"><button type="button" className="icon-btn" onClick={onClose}>Cancelar</button><button type="submit" className="icon-btn home-sync-button" disabled={busy||!loaded}>{busy?'Guardando…':'Registrar inscripción'}</button></div></form>}
 </section></div>
}
