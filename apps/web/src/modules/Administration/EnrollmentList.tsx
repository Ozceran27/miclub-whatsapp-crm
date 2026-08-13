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
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return <PaginatedList id="enrollment-list" eyebrow="Inscripciones" title="Inscripciones del club" description="Consulta paginada; sólo se descargan 20 registros por vez." searchLabel="Persona, actividad o sector" search={search} status={status} statusLabel="Estado" statusOptions={statusOptions} loading={loading} error={error} total={total} page={page} pageSize={PAGE_SIZE} emptyMessage="No hay inscripciones para estos filtros." onSearchChange={setSearch} onStatusChange={setStatus} onFilter={(event) => { event.preventDefault(); setPage(1); setFilters({ search, status }); }} onPageChange={setPage} onRetry={() => void load()}>
    <div className="paginated-list__table-wrap"><table className="paginated-list__table"><thead><tr><th>N.º</th><th>Persona</th><th>Actividad</th><th>Sector</th><th>Estado</th><th>Vencimiento</th><th>Cuota</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="paginated-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${item.displayName || 'inscripción'}`} onClick={() => setSelectedEnrollment(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEnrollment(item); } }}><td>#{item.sequenceNumber}</td><td><strong>{item.displayName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Sin nombre'}</strong><small>{item.dni ? `DNI ${item.dni}` : ''}</small></td><td>{item.activityName || 'Sin actividad'}</td><td>{item.sectorName || 'Sin sector'}</td><td>{item.status.replaceAll('_', ' ')}</td><td>{item.dueDate ? date.format(new Date(item.dueDate)) : 'Sin fecha'}</td><td>{money.format(item.feeAmount)}</td></tr>)}</tbody></table></div>
    {selectedEnrollment && <EnrollmentDetailModal enrollment={selectedEnrollment} onClose={() => setSelectedEnrollment(null)} />}
  </PaginatedList>;
}
