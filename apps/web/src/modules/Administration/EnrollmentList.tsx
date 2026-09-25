import type { AdministrationEnrollmentDto } from '@miclub/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getAdministrationEnrollments } from '../../services/api/administrationApi';
import { PaginatedList } from './PaginatedList';
import { EnrollmentDetailModal } from './EnrollmentDetailModal';
import { PERMISSIONS } from '@miclub/shared';
import { apiJson } from '../../api';
import { useSession } from '../../session';
import { invalidateTenantQueries } from '../../serverState/invalidation';

const PAGE_SIZE = 20;
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });
const statusOptions = [{ value: 'al_dia', label: 'Al día' }, { value: 'nuevo_inscripto', label: 'Nuevo inscripto' }, { value: 'adeudando', label: 'Adeudando' }, { value: 'abandonado', label: 'Abandonado' }, { value: 'cancelado', label: 'Cancelado' }];

export function EnrollmentList() {
  const {permissions,clubId}=useSession();
  const [generateBusy,setGenerateBusy]=useState(false);const [generateError,setGenerateError]=useState('');
  const [generated,setGenerated]=useState<number|null>(null);
  const quotaRef=useRef<HTMLDetailsElement>(null);
  const operationKeys=useRef(new Map<string,string>());
  const [items, setItems] = useState<AdministrationEnrollmentDto[]>([]);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<AdministrationEnrollmentDto | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(null); try { const response = await getAdministrationEnrollments(page, filters, signal); setItems(response.items); setTotal(response.total); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las inscripciones.'); } finally { if (!signal?.aborted) setLoading(false); } }, [page, filters]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener('miclub:enrollment-created', refresh); return () => window.removeEventListener('miclub:enrollment-created', refresh); }, [load]);
  useEffect(()=>{const open=()=>{if(quotaRef.current){quotaRef.current.open=true;quotaRef.current.querySelector<HTMLElement>('summary')?.focus();}};window.addEventListener('miclub:open-quotas',open);return()=>window.removeEventListener('miclub:open-quotas',open);},[]);
  const generate=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(generateBusy)return;const f=new FormData(event.currentTarget);const body={month:f.get('month'),reason:f.get('reason')};const fingerprint=JSON.stringify({clubId,body});const key=operationKeys.current.get(fingerprint)??crypto.randomUUID();operationKeys.current.set(fingerprint,key);setGenerateBusy(true);setGenerateError('');setGenerated(null);void apiJson<{generated:number}>('/api/finance/receivables/generate',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(body)}).then(result=>{operationKeys.current.delete(fingerprint);setGenerated(result.generated);invalidateTenantQueries(clubId);window.dispatchEvent(new Event('miclub:receivables-changed'));void load();}).catch(cause=>setGenerateError(cause instanceof Error?cause.message:'No se pudieron generar las cuotas.')).finally(()=>setGenerateBusy(false));};
  return <PaginatedList id="enrollment-list" eyebrow="Inscripciones" title="Inscripciones del club" description="Consulta paginada; sólo se descargan 20 registros por vez." searchLabel="Persona, actividad o sector" search={search} status={status} statusLabel="Estado" statusOptions={statusOptions} loading={loading} error={error} total={total} page={page} pageSize={PAGE_SIZE} emptyMessage="No hay inscripciones para estos filtros." onSearchChange={setSearch} onStatusChange={setStatus} onFilter={(event) => { event.preventDefault(); setPage(1); setFilters({ search, status }); }} onPageChange={setPage} onRetry={() => void load()} actions={permissions.includes(PERMISSIONS.ENROLLMENTS_CREATE)&&<details ref={quotaRef} className="enrollment-quotas"><summary tabIndex={0}>Generar cuotas del mes</summary><form className="finance-form" onSubmit={generate}><label>Mes<input name="month" type="month" defaultValue={new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).slice(0,7)} required/></label><label>Motivo<input name="reason" required/></label><button disabled={generateBusy}>{generateBusy?'Generando…':'Generar cuotas'}</button></form>{generateError&&<p role="alert">{generateError}</p>}{generated!==null&&<p role="status">{generated} cuotas generadas. Las existentes se conservaron.</p>}</details>} overlays={selectedEnrollment && <EnrollmentDetailModal enrollment={selectedEnrollment} onClose={() => setSelectedEnrollment(null)} onChanged={() => {setSelectedEnrollment(null);void load();}} />}>
    <div className="paginated-list__table-wrap"><table className="paginated-list__table" data-kind="enrollment"><thead><tr><th>N.º</th><th>Persona</th><th>Actividad</th><th>Sector</th><th>Estado</th><th>Vencimiento</th><th>Cuota</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="paginated-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${item.displayName || 'inscripción'}`} onClick={() => setSelectedEnrollment(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEnrollment(item); } }}><td data-label="N.º">#{item.sequenceNumber}</td><td data-label="Persona" title={item.displayName || 'Sin nombre'}><strong>{item.displayName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Sin nombre'}</strong><small>{item.dni ? `DNI ${item.dni}` : ''}</small></td><td data-label="Actividad" title={item.activityName || 'Sin actividad'}>{item.activityName || 'Sin actividad'}</td><td data-label="Sector" title={item.sectorName || 'Sin sector'}>{item.sectorName || 'Sin sector'}</td><td data-label="Estado">{item.status.replaceAll('_', ' ')}</td><td data-label="Vencimiento">{item.dueDate ? date.format(new Date(item.dueDate)) : 'Sin fecha'}</td><td data-label="Cuota">{money.format(item.feeAmount)}</td></tr>)}</tbody></table></div>
  </PaginatedList>;
}
