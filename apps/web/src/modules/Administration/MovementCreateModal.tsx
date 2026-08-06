import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createAdministrationMovement, getMovementFormCatalogs, type MovementCatalogItem } from '../../services/api/administrationApi';
import { invalidateMovementQueries } from '../../serverState/invalidation';
import { useSession } from '../../session';

type Props={open:boolean;onClose:()=>void;onCreated:()=>void};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
const Field=({label,children}:{label:string;children:ReactNode})=><label className="movement-form__field"><span>{label}</span>{children}</label>;

export function MovementCreateModal({open,onClose,onCreated}:Props){
 const {clubId}=useSession();
 const [catalogs,setCatalogs]=useState<{categories:MovementCatalogItem[];sectors:MovementCatalogItem[];activities:MovementCatalogItem[];paymentMethods:MovementCatalogItem[]}|null>(null);
 const [type,setType]=useState<'INGRESOS'|'EGRESOS'>('INGRESOS'),[sectorId,setSectorId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;const c=new AbortController();setError('');void getMovementFormCatalogs(c.signal).then(setCatalogs).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar los catálogos.'));return()=>c.abort()},[open]);
 const categories=useMemo(()=>catalogs?.categories.filter(x=>x.direction===type&&x.isActive!==false)??[],[catalogs,type]);
 const activities=useMemo(()=>catalogs?.activities.filter(x=>x.sectorId===sectorId)??[],[catalogs,sectorId]);
 if(!open)return null;
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{await createAdministrationMovement({concept:data.get('concept'),amount:Number(data.get('amount')),movementType:type,categoryId:data.get('categoryId'),sectorId,activityId:data.get('activityId')||null,paymentMethodId:data.get('paymentMethodId'),counterpartyText:data.get('counterpartyText'),movementDate:data.get('movementDate'),operationalStatus:data.get('operationalStatus')},crypto.randomUUID());invalidateMovementQueries(clubId);onCreated();onClose()}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el movimiento.')}finally{setBusy(false)}};
 return <div className="sector-modal__backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sector-modal movement-form-modal" role="dialog" aria-modal="true" aria-labelledby="movement-form-title">
  <header className="sector-modal__header"><div><p className="eyebrow">Economía</p><h2 id="movement-form-title">Cargar movimiento</h2><p>Registrá un ingreso o egreso con clasificación canónica.</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
  {!catalogs&&!error?<p>Cargando catálogos…</p>:<form className="movement-form" onSubmit={submit}>
   <div className="movement-form__grid"><Field label="Concepto"><input name="concept" required maxLength={500}/></Field><Field label="Monto"><input name="amount" type="number" min="0.01" step="0.01" required/></Field>
   <Field label="Tipo"><select value={type} onChange={e=>setType(e.target.value as typeof type)}><option value="INGRESOS">Ingreso</option><option value="EGRESOS">Egreso</option></select></Field>
   <Field label="Categoría canónica"><select name="categoryId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Sector"><select required value={sectorId} onChange={e=>setSectorId(e.target.value)}><option value="" disabled>Seleccionar…</option>{catalogs?.sectors.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Actividad (opcional)"><select name="activityId" defaultValue="" disabled={!sectorId}><option value="">Sin actividad</option>{activities.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Medio de pago"><select name="paymentMethodId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{catalogs?.paymentMethods.filter(x=>x.isActive!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Contraparte"><input name="counterpartyText" required maxLength={250}/></Field><Field label="Fecha"><input name="movementDate" type="date" required defaultValue={today()}/></Field>
   <Field label="Estado inicial"><select name="operationalStatus" defaultValue="COMPLETADO"><option value="COMPLETADO">Completado</option><option value="PENDIENTE">Pendiente</option></select></Field></div>
   {error&&<p className="sector-modal__error" role="alert">{error}</p>}<div className="movement-form__actions"><button type="button" className="icon-btn" onClick={onClose}>Cancelar</button><button type="submit" className="icon-btn home-sync-button" disabled={busy||!catalogs}>{busy?'Guardando…':'Registrar movimiento'}</button></div>
  </form>}
 </section></div>
}
