import { useMemo, useState } from 'react';
export const DEFAULT_SORT_BY = 'lastPaymentAt';
export const DEFAULT_SORT_DIRECTION = 'asc';
export const SORT_OPTIONS = [
    { value: 'nombre', label: 'Nombre' },
    { value: 'apellido', label: 'Apellido' },
    { value: 'actividad', label: 'Actividad / Disciplina' },
    { value: 'sourceSheet', label: 'Hoja / Sector' },
    { value: 'estado', label: 'Estado' },
    { value: 'cuota', label: 'Cuota' },
    { value: 'lastPaymentAt', label: 'Último pago' },
    { value: 'lastContactAt', label: 'Último contacto' },
    { value: 'contactedRecently', label: 'Contactado recientemente' }
];
export const SORT_LABEL_BY_VALUE = SORT_OPTIONS.reduce((acc, option) => ({ ...acc, [option.value]: option.label }), {});
const isEmptySortValue = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const compareText = (a, b) => {
    const aEmpty = isEmptySortValue(a);
    const bEmpty = isEmptySortValue(b);
    if (aEmpty || bEmpty)
        return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
    return String(a).localeCompare(String(b), 'es-AR', { sensitivity: 'base' });
};
const compareNumber = (a, b) => {
    const aNumber = typeof a === 'number' ? a : Number(a);
    const bNumber = typeof b === 'number' ? b : Number(b);
    const aEmpty = isEmptySortValue(a) || Number.isNaN(aNumber);
    const bEmpty = isEmptySortValue(b) || Number.isNaN(bNumber);
    if (aEmpty || bEmpty)
        return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
    return aNumber - bNumber;
};
const compareDate = (a, b) => {
    const aTime = typeof a === 'string' || typeof a === 'number' ? Date.parse(String(a)) : NaN;
    const bTime = typeof b === 'string' || typeof b === 'number' ? Date.parse(String(b)) : NaN;
    const aEmpty = isEmptySortValue(a) || Number.isNaN(aTime);
    const bEmpty = isEmptySortValue(b) || Number.isNaN(bTime);
    if (aEmpty || bEmpty)
        return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
    return aTime - bTime;
};
const getSortValue = (member, sortBy, recentContact) => {
    switch (sortBy) {
        case 'nombre': return member.nombre;
        case 'apellido': return member.apellido;
        case 'actividad': return member.actividad;
        case 'sourceSheet': return member.sourceSheet;
        case 'estado': return member.estado;
        case 'cuota': return member.cuota;
        case 'lastPaymentAt': return member.lastPaymentAt;
        case 'lastContactAt': return recentContact?.lastSentAt;
        case 'contactedRecently': return Boolean(recentContact);
        default: return undefined;
    }
};
const compareMembers = (a, b, sortBy, sortDirection, contactedByMemberId) => {
    const aValue = getSortValue(a, sortBy, contactedByMemberId[a.id]);
    const bValue = getSortValue(b, sortBy, contactedByMemberId[b.id]);
    const baseComparison = sortBy === 'cuota' || sortBy === 'contactedRecently' ? compareNumber(Number(aValue), Number(bValue)) : sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt' ? compareDate(aValue, bValue) : compareText(aValue, bValue);
    if (baseComparison === 0)
        return compareText(`${a.apellido} ${a.nombre}`, `${b.apellido} ${b.nombre}`);
    const aEmpty = sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt' ? Number.isNaN(Date.parse(String(aValue ?? ''))) : isEmptySortValue(aValue);
    const bEmpty = sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt' ? Number.isNaN(Date.parse(String(bValue ?? ''))) : isEmptySortValue(bValue);
    if (aEmpty || bEmpty)
        return baseComparison;
    return sortDirection === 'asc' ? baseComparison : -baseComparison;
};
export const useCrmFilters = (members, debtors, contactedRecent) => {
    const [selected, setSelected] = useState([]);
    const [query, setQuery] = useState('');
    const [sheetFilter, setSheetFilter] = useState('ALL');
    const [activityFilter, setActivityFilter] = useState('ALL');
    const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY);
    const [sortDirection, setSortDirection] = useState(DEFAULT_SORT_DIRECTION);
    const [viewMode, setViewMode] = useState('debtors');
    const baseRows = viewMode === 'debtors' ? debtors : members;
    const filtered = useMemo(() => {
        const normalizedQuery = query.toLowerCase();
        const filteredRows = baseRows.filter((d) => `${d.nombre} ${d.apellido}`.toLowerCase().includes(normalizedQuery) && (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) && (activityFilter === 'ALL' || d.actividad === activityFilter));
        return [...filteredRows].sort((a, b) => compareMembers(a, b, sortBy, sortDirection, contactedRecent.byMemberId));
    }, [baseRows, query, sheetFilter, activityFilter, sortBy, sortDirection, contactedRecent.byMemberId]);
    const changeSort = (nextSortBy) => setSortBy((currentSortBy) => { if (currentSortBy === nextSortBy) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentSortBy;
    } setSortDirection(DEFAULT_SORT_DIRECTION); return nextSortBy; });
    const resetSort = () => { setSortBy(DEFAULT_SORT_BY); setSortDirection(DEFAULT_SORT_DIRECTION); };
    const renderSortIndicator = (columnSortBy) => (sortBy === columnSortBy ? (sortDirection === 'asc' ? '↑' : '↓') : '');
    const visibleDebtors = filtered.filter((m) => m.estado === 'Adeudando');
    const allVisibleSelected = visibleDebtors.length > 0 && visibleDebtors.every((d) => selected.includes(d.id));
    const toggleAllDebtors = () => setSelected(allVisibleSelected ? selected.filter((id) => !visibleDebtors.some((f) => f.id === id)) : Array.from(new Set([...selected, ...visibleDebtors.map((f) => f.id)])));
    const clearSelection = () => setSelected([]);
    const allSheets = Array.from(new Set(members.map((d) => d.sourceSheet)));
    const allActivities = Array.from(new Set(members.map((d) => d.actividad).filter((activity) => Boolean(activity))));
    return { selected, setSelected, query, setQuery, sheetFilter, setSheetFilter, activityFilter, setActivityFilter, sortBy, setSortBy, sortDirection, setSortDirection, viewMode, setViewMode, filtered, changeSort, resetSort, renderSortIndicator, toggleAllDebtors, clearSelection, allSheets, allActivities };
};
