import type { FormEvent, ReactNode } from 'react';

export type FilterOption = { value: string; label: string };

type Props = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  searchLabel: string;
  search: string;
  status: string;
  statusLabel: string;
  statusOptions: FilterOption[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;
  children: ReactNode;
  emptyMessage: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onFilter: (event: FormEvent) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
};

export function PaginatedList({ id, eyebrow, title, description, searchLabel, search, status, statusLabel, statusOptions, loading, error, total, page, pageSize, children, emptyMessage, onSearchChange, onStatusChange, onFilter, onPageChange, onRetry }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <section className="section-panel paginated-list" aria-labelledby={`${id}-title`} aria-busy={loading}>
    <div className="section-header"><div><p className="eyebrow">{eyebrow}</p><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></div><strong className="paginated-list__total">{error ? 'Total no disponible' : `${total.toLocaleString('es-AR')} en total`}</strong></div>
    <form className="paginated-list__filters" onSubmit={onFilter}>
      <label><span>{searchLabel}</span><input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar…" /></label>
      <label><span>{statusLabel}</span><select value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">Todos</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button className="ghost-btn" type="submit" disabled={loading}>{loading ? 'Cargando…' : 'Aplicar filtros'}</button>
    </form>
    {loading ? <p className="sector-list__state" role="status">Cargando resultados…</p> : error ? <div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Reintentar</button></div> : total === 0 ? <p className="sector-list__state">{emptyMessage}</p> : children}
    <nav className="paginated-list__pagination" aria-label={`Paginación de ${title}`}><button type="button" onClick={() => onPageChange(page - 1)} disabled={loading || page <= 1}>Anterior</button><span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span><button type="button" onClick={() => onPageChange(page + 1)} disabled={loading || page >= totalPages}>Siguiente</button></nav>
  </section>;
}
