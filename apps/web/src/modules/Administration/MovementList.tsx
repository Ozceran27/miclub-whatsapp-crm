import type { AdministrationMovementDto } from '@miclub/shared';
import { useCallback, useEffect, useState } from 'react';
import { getAdministrationMovements } from '../../services/api/administrationApi';
import { PaginatedList } from './PaginatedList';
import { MovementDetailModal } from './MovementDetailModal';

const PAGE_SIZE = 20;
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });
const statusOptions = [{ value: 'INGRESOS', label: 'Ingresos' }, { value: 'EGRESOS', label: 'Egresos' }];

export function MovementList() {
  const [items, setItems] = useState<AdministrationMovementDto[]>([]);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [type, setType] = useState('');
  const [filters, setFilters] = useState({ search: '', type: '' });
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<AdministrationMovementDto | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(null); try { const response = await getAdministrationMovements(page, filters, signal); setItems(response.items); setTotal(response.total); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los movimientos.'); } finally { if (!signal?.aborted) setLoading(false); } }, [page, filters]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return <PaginatedList id="movement-list" eyebrow="Movimientos" title="Movimientos del club" description="Consulta paginada; sólo se descargan 20 registros por vez." searchLabel="Concepto, persona o categoría" search={search} status={type} statusLabel="Tipo" statusOptions={statusOptions} loading={loading} error={error} total={total} page={page} pageSize={PAGE_SIZE} emptyMessage="No hay movimientos para estos filtros." onSearchChange={setSearch} onStatusChange={setType} onFilter={(event) => { event.preventDefault(); setPage(1); setFilters({ search, type }); }} onPageChange={setPage} onRetry={() => void load()}>
    <div className="paginated-list__table-wrap"><table className="paginated-list__table"><thead><tr><th>N.º</th><th>Fecha</th><th>Concepto</th><th>Sector</th><th>Tipo</th><th>Estado</th><th>Monto</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="paginated-list__row" tabIndex={0} role="button" aria-label={`Ver detalle de ${item.concept || item.category || 'movimiento'}`} onClick={() => setSelectedMovement(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedMovement(item); } }}><td>#{item.sequenceNumber}</td><td>{item.date ? date.format(new Date(item.date)) : 'Sin fecha'}</td><td><strong>{item.concept || item.category || 'Sin concepto'}</strong><small>{item.counterpartyText || item.paymentMethod || ''}</small></td><td>{item.sector || 'Sin sector'}</td><td>{item.type?.toLocaleLowerCase('es-AR') || 'Sin tipo'}</td><td>{item.status?.replaceAll('_', ' ').toLocaleLowerCase('es-AR') || 'Sin estado'}</td><td className={item.type === 'EGRESOS' ? 'paginated-list__expense' : ''}>{money.format(item.amount)}</td></tr>)}</tbody></table></div>
    {selectedMovement && <MovementDetailModal movement={selectedMovement} onClose={() => setSelectedMovement(null)} />}
  </PaginatedList>;
}
