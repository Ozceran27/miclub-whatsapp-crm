import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createAdministrationMovement, getMovementFormCatalogs, type MovementCatalogItem } from '../../services/api/administrationApi';
import { invalidateMovementQueries } from '../../serverState/invalidation';
import { useSession } from '../../session';
import { useModalAccessibility } from './useModalAccessibility';
import { MovementPersonPicker } from './MovementPersonPicker';
import { MovementReceivableApplications, type ReceivableApplication } from './MovementReceivableApplications';

type Props={open:boolean;onClose:()=>void;onCreated:()=>void};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
const Field=({label,children}:{label:string;children:ReactNode})=><label className="movement-form__field"><span>{label}</span>{children}</label>;

export function MovementCreateModal({open,onClose,onCreated}:Props){
 const {clubId}=useSession();
 const dialogRef=useRef<HTMLElement>(null);
 const operationKeys=useRef(new Map<string,string>());
 const [catalogs,setCatalogs]=useState<{categories:MovementCatalogItem[];sectors:MovementCatalogItem[];activities:MovementCatalogItem[];paymentMethods:MovementCatalogItem[];accounts:MovementCatalogItem[]}|null>(null);
 const [type,setType]=useState<'INGRESOS'|'EGRESOS'>('INGRESOS'),[sectorId,setSectorId]=useState(''),[activityId,setActivityId]=useState(''),[accountId,setAccountId]=useState(''),[personId,setPersonId]=useState(''),[applications,setApplications]=useState<ReceivableApplication[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useModalAccessibility(dialogRef,open,()=>{if(!busy)onClose()});
 useEffect(()=>{if(!open)return;const c=new AbortController();const timer=window.setTimeout(()=>{setError('');setCatalogs(null);void getMovementFormCatalogs(c.signal).then(result=>{if(!c.signal.aborted)setCatalogs(result)}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'No se pudieron cargar los catálogos.');});},0);return()=>{window.clearTimeout(timer);c.abort()}},[open]);
 const categories=useMemo(()=>catalogs?.categories.filter(x=>x.isActive!==false).sort((a,b)=>(a.displayOrder??0)-(b.displayOrder??0))??[],[catalogs]);
 const activities=useMemo(()=>catalogs?.activities.filter(x=>x.sectorId===sectorId)??[],[catalogs,sectorId]);
 const currencyCode=catalogs?.accounts.find(account=>account.id===accountId)?.currencyCode??'';
 if(!open)return null;
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;setBusy(true);setError('');const data=new FormData(event.currentTarget);try{const amount=Number(data.get('amount'));if(applications.some(item=>item.amount<=0)||applications.reduce((sum,item)=>sum+item.amount,0)>amount)throw new Error('Las aplicaciones superan el importe del movimiento.');const movement={accountId,concept:data.get('concept'),amount,movementType:type,categoryId:data.get('categoryId'),sectorId,activityId:activityId||null,personId:personId||null,paymentMethodId:data.get('paymentMethodId'),counterpartyText:data.get('counterpartyText'),movementDate:data.get('movementDate'),operationalStatus:data.get('operationalStatus')};const selected=applications.length?applications:undefined;const fingerprint=JSON.stringify({clubId,movement,selected});const key=operationKeys.current.get(fingerprint)??crypto.randomUUID();operationKeys.current.set(fingerprint,key);await createAdministrationMovement(movement,key,selected);operationKeys.current.delete(fingerprint);invalidateMovementQueries(clubId);window.dispatchEvent(new Event('miclub:movement-created'));window.dispatchEvent(new Event('miclub:receivables-changed'));onCreated();onClose()}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el movimiento.')}finally{setBusy(false)}};
 return <div className="sector-modal__backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section ref={dialogRef} tabIndex={-1} className="sector-modal movement-form-modal" role="dialog" aria-modal="true" aria-labelledby="movement-form-title">
  <header className="sector-modal__header"><div><p className="eyebrow">Tesorería</p><h2 id="movement-form-title">Cargar movimiento</h2><p>Registrá un ingreso o egreso con clasificación canónica.</p></div><button className="sector-modal__close" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar">×</button></header>
  {!catalogs&&!error?<p>Cargando catálogos…</p>:<form className="movement-form" onSubmit={event=>void submit(event)}>
   <div className="movement-form__grid"><Field label="Concepto"><input name="concept" required maxLength={500}/></Field><Field label="Monto"><input name="amount" type="number" min="0.01" step="0.01" required/></Field>
   <Field label="Tipo"><select value={type} onChange={e=>{setType(e.target.value as typeof type);setApplications([]);}}><option value="INGRESOS">Ingreso</option><option value="EGRESOS">Egreso</option></select></Field>
   <Field label="Categoría canónica"><select key={type} name="categoryId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Sector"><select required value={sectorId} onChange={e=>{setSectorId(e.target.value);setActivityId('');setApplications([]);}}><option value="" disabled>Seleccionar…</option>{catalogs?.sectors.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Actividad (opcional)"><select value={activityId} onChange={e=>{setActivityId(e.target.value);setApplications([]);}} disabled={!sectorId}><option value="">Sin actividad</option>{activities.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Cuenta financiera"><select required value={accountId} onChange={e=>{setAccountId(e.target.value);setApplications([]);}}><option value="" disabled>Seleccionar…</option>{catalogs?.accounts.map(x=><option key={x.id} value={x.id}>{x.name}{x.currencyCode?` · ${x.currencyCode}`:''}</option>)}</select></Field><Field label="Medio de pago"><select name="paymentMethodId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{catalogs?.paymentMethods.filter(x=>x.isActive!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Contraparte"><input name="counterpartyText" required maxLength={250}/></Field><Field label="Fecha"><input name="movementDate" type="date" required defaultValue={today()}/></Field>
   <Field label="Estado inicial"><select name="operationalStatus" defaultValue="COMPLETADO"><option value="COMPLETADO">Completado</option><option value="PENDIENTE">Pendiente</option></select></Field></div>
   <MovementPersonPicker value={personId} onChange={id=>{setPersonId(id);setApplications([]);}}/>
   {type==='INGRESOS'&&<MovementReceivableApplications personId={personId} activityId={activityId} currencyCode={currencyCode} value={applications} onChange={setApplications}/>}
   {error&&<p className="sector-modal__error" role="alert">{error}</p>}<div className="movement-form__actions"><button type="button" className="icon-btn" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="icon-btn home-sync-button" disabled={busy||!catalogs}>{busy?'Guardando…':'Registrar movimiento'}</button></div>
  </form>}
 </section></div>
}
