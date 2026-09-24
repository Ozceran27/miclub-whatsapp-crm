import type { AdministrationEnrollmentDto } from '@miclub/shared';
import { useCallback, useEffect, useState } from 'react';
import { getAdministrationEnrollments } from '../../services/api/administrationApi';
import { PaginatedList } from './PaginatedList';
import { EnrollmentDetailModal } from './EnrollmentDetailModal';

const PAGE_SIZE = 20;
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });
const statusOptions = [{ value: 'al_dia', label: 'Al día' }, { value: 'nuevo_inscripto', label: 'Nuevo inscripto' }, { value: 'adeudando', label: 'Adeudando' }, { value: 'abandonado', label: 'Abandonado' }, { value: 'cancelado', label: 'Cancelado' }];

export function EnrollmentList() {
  const [items, setItems] = useState<AdministrationEnrollmentDto[]>([]);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<AdministrationEnrollmentDto | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(null); try { const response = await getAdministrationEnrollments(page, filters, signal); setItems(response.items); setTotal(response.total); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las inscripciones.'); } finally { if (!signal?.aborted) setLoading(false); } }, [page, filters]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener('miclub:enrollment-created', refresh); return () => window.removeEventListener('miclub:enrollment-created', refresh); }, [load]);
  return <PaginatedList id="enrollment-list" eyebrow="Inscripciones" title="Inscripciones del club" description="Consulta paginada; sólo se descargan 20 registros por vez." searchLabel="Persona, actividad o sector" search={search} status={status} statusLabel="Estado" statusOptions={statusOptions} loading={loading} error={error} total={total} page={page} pageSize={PAGE_SIZE} emptyMessage="No hay inscripciones para estos filtros." onSearchChange={setSearch} onStatusChange={setStatus} onFilter={(event) => { event.preventDefault(); setPage(1); setFilters({ search, status }); }} onPageChange={setPage} onRetry={() => void load()}>
    <div className="paginated-list__table-wrap"><table className="paginated-list__table" data-kind="enrollment"><thead><tr><th>N.º</th><th>Persona</th><th>Actividad</th><th>Sector</th><th>Estado</th><th>Vencimiento</th><th>Cuota</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="paginated-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${item.displayName || 'inscripción'}`} onClick={() => setSelectedEnrollment(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEnrollment(item); } }}><td data-label="N.º">#{item.sequenceNumber}</td><td data-label="Persona" title={item.displayName || 'Sin nombre'}><strong>{item.displayName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Sin nombre'}</strong><small>{item.dni ? `DNI ${item.dni}` : ''}</small></td><td data-label="Actividad" title={item.activityName || 'Sin actividad'}>{item.activityName || 'Sin actividad'}</td><td data-label="Sector" title={item.sectorName || 'Sin sector'}>{item.sectorName || 'Sin sector'}</td><td data-label="Estado">{item.status.replaceAll('_', ' ')}</td><td data-label="Vencimiento">{item.dueDate ? date.format(new Date(item.dueDate)) : 'Sin fecha'}</td><td data-label="Cuota">{money.format(item.feeAmount)}</td></tr>)}</tbody></table></div>
    {selectedEnrollment && <EnrollmentDetailModal enrollment={selectedEnrollment} onClose={() => setSelectedEnrollment(null)} />}
  </PaginatedList>;
}
