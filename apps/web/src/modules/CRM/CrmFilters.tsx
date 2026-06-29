import type { SortBy, SortDirection, ViewMode } from './types';
import { Icon } from './Icon';
import { SORT_LABEL_BY_VALUE, SORT_OPTIONS } from './useCrmFilters';

type Props = { viewMode: ViewMode; setViewMode: (value: ViewMode) => void; clearSelection: () => void; query: string; setQuery: (value: string) => void; sheetFilter: string; setSheetFilter: (value: string) => void; activityFilter: string; setActivityFilter: (value: string) => void; allSheets: string[]; allActivities: string[]; sortBy: SortBy; setSortBy: (value: SortBy) => void; sortDirection: SortDirection; setSortDirection: (value: SortDirection) => void; resetSort: () => void };
export const CrmFilters = ({ viewMode, setViewMode, clearSelection, query, setQuery, sheetFilter, setSheetFilter, activityFilter, setActivityFilter, allSheets, allActivities, sortBy, setSortBy, sortDirection, setSortDirection, resetSort }: Props) => <>
  <section className="filters">
    <select value={viewMode} onChange={e => { setViewMode(e.target.value as ViewMode); clearSelection(); }}>
      <option value="debtors">Solo deudores</option><option value="members">Todos los inscriptos</option>
    </select>
    <input placeholder="Buscar por nombre/apellido" value={query} onChange={e => setQuery(e.target.value)} />
    <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}><option value="ALL">Todas las hojas</option>{allSheets.map(s => <option key={s}>{s}</option>)}</select>
    <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="ALL">Todas las actividades</option>{allActivities.map(s => <option key={s}>{s}</option>)}</select>
  </section>
  <section className="sort-controls" aria-label="Controles de ordenamiento">
    <label>Ordenar por<select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label>Dirección<select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as SortDirection)}><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></label>
    <button className="icon-btn ghost-btn" onClick={resetSort}><Icon label="↺" />Restablecer orden</button>
    <p className="sort-summary">Ordenando por: {SORT_LABEL_BY_VALUE[sortBy]} · {sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}</p>
  </section>
</>;
