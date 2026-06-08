import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatArPeso } from './utils';
const Icon = ({ label }) => _jsx("span", { "aria-hidden": "true", className: "mini-icon", children: label });
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const DEFAULT_SORT_BY = 'lastPaymentAt';
const DEFAULT_SORT_DIRECTION = 'asc';
const SORT_OPTIONS = [
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
const SORT_LABEL_BY_VALUE = SORT_OPTIONS.reduce((acc, option) => ({ ...acc, [option.value]: option.label }), {});
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
        case 'nombre':
            return member.nombre;
        case 'apellido':
            return member.apellido;
        case 'actividad':
            return member.actividad;
        case 'sourceSheet':
            return member.sourceSheet;
        case 'estado':
            return member.estado;
        case 'cuota':
            return member.cuota;
        case 'lastPaymentAt':
            return member.lastPaymentAt;
        case 'lastContactAt':
            return recentContact?.lastSentAt;
        case 'contactedRecently':
            return Boolean(recentContact);
        default:
            return undefined;
    }
};
const compareMembers = (a, b, sortBy, sortDirection, contactedByMemberId) => {
    const aValue = getSortValue(a, sortBy, contactedByMemberId[a.id]);
    const bValue = getSortValue(b, sortBy, contactedByMemberId[b.id]);
    const baseComparison = sortBy === 'cuota' || sortBy === 'contactedRecently'
        ? compareNumber(Number(aValue), Number(bValue))
        : sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt'
            ? compareDate(aValue, bValue)
            : compareText(aValue, bValue);
    if (baseComparison === 0) {
        return compareText(`${a.apellido} ${a.nombre}`, `${b.apellido} ${b.nombre}`);
    }
    const aEmpty = sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt'
        ? Number.isNaN(Date.parse(String(aValue ?? '')))
        : isEmptySortValue(aValue);
    const bEmpty = sortBy === 'lastPaymentAt' || sortBy === 'lastContactAt'
        ? Number.isNaN(Date.parse(String(bValue ?? '')))
        : isEmptySortValue(bValue);
    if (aEmpty || bEmpty)
        return baseComparison;
    return sortDirection === 'asc' ? baseComparison : -baseComparison;
};
const ACTIONABLE_STATUSES = ['prepared', 'opened'];
const STATUS_META = {
    prepared: { label: 'Pendiente', icon: '🕒', className: 'status-chip--prepared' },
    opened: { label: 'Abierto', icon: '👁', className: 'status-chip--opened' },
    sent_manual: { label: 'Enviado manualmente', icon: '✓', className: 'status-chip--sent' },
    skipped: { label: 'Omitido', icon: '✕', className: 'status-chip--skipped' }
};
const fill = (tpl, m) => {
    if (!m)
        return tpl;
    const values = {
        nombre: m.nombre,
        apellido: m.apellido,
        actividad: m.actividad ?? '',
        modalidad: m.modalidad ?? '',
        cuota: m.cuota !== undefined ? formatArPeso(m.cuota) : '',
        instructor: m.instructor ?? ''
    };
    return tpl.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};
const getStatusLabel = (status) => STATUS_META[status ?? 'prepared'].label;
const getStatusIcon = (status) => STATUS_META[status ?? 'prepared'].icon;
const getStatusClass = (status) => STATUS_META[status ?? 'prepared'].className;
const formatDateTime = (value) => {
    if (!value)
        return 'Sin fecha';
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
const formatPaymentDate = (value) => {
    if (!value)
        return 'Sin pagos registrados';
    return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const formatLastPayment = (member) => {
    if (!member.lastPaymentAt)
        return 'Sin pagos registrados';
    const amount = member.lastPaymentAmount !== undefined ? ` · ${formatArPeso(member.lastPaymentAmount)}` : '';
    return `${formatPaymentDate(member.lastPaymentAt)}${amount}`;
};
const summarizeMessage = (message, max = 120) => message.length > max ? `${message.slice(0, max).trimEnd()}…` : message;
export default function App() {
    // ...
    const [members, setMembers] = useState([]);
    const [debtors, setDebtors] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [summary, setSummary] = useState(null);
    const [selected, setSelected] = useState([]);
    const [query, setQuery] = useState('');
    const [sheetFilter, setSheetFilter] = useState('ALL');
    const [activityFilter, setActivityFilter] = useState('ALL');
    const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY);
    const [sortDirection, setSortDirection] = useState(DEFAULT_SORT_DIRECTION);
    const [viewMode, setViewMode] = useState('debtors');
    const [message, setMessage] = useState('');
    const [prepared, setPrepared] = useState([]);
    const [history, setHistory] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyMeta, setHistoryMeta] = useState({ pageSize: 20, total: 0, totalPages: 0 });
    const [contactedRecent, setContactedRecent] = useState({ windowDays: 30, since: new Date(0).toISOString(), memberIds: [], byMemberId: {} });
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState(null);
    const [testMode, setTestMode] = useState(true);
    const [templateStatus, setTemplateStatus] = useState('idle');
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    const loadHistory = async (page = 1) => {
        const res = await fetch(`${API}/history?page=${page}&pageSize=20`);
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo cargar el historial.');
        }
        const payload = (await res.json());
        setHistory(payload.items);
        setHistoryPage(payload.page);
        setHistoryMeta({ pageSize: payload.pageSize, total: payload.total, totalPages: payload.totalPages });
    };
    const sync = async () => {
        setSyncing(true);
        setError(null);
        try {
            const [mRes, dRes, tRes, sRes, sumRes, hRes, cRes] = await Promise.all([
                fetch(`${API}/members`),
                fetch(`${API}/debtors`),
                fetch(`${API}/templates`),
                fetch(`${API}/sync-status`),
                fetch(`${API}/summary`),
                fetch(`${API}/history?page=1&pageSize=20`),
                fetch(`${API}/contacted-recent`)
            ]);
            if (!mRes.ok || !dRes.ok || !tRes.ok || !sRes.ok || !sumRes.ok || !hRes.ok || !cRes.ok) {
                throw new Error('No se pudo sincronizar la información.');
            }
            const [m, d, t, s, sum, h, c] = await Promise.all([
                mRes.json(),
                dRes.json(),
                tRes.json(),
                sRes.json(),
                sumRes.json(),
                hRes.json(),
                cRes.json()
            ]);
            setMembers(m);
            setDebtors(d);
            setTemplates(t);
            setSyncStatus(s);
            setSummary(sum);
            const historyPayload = h;
            setHistory(historyPayload.items);
            setHistoryPage(historyPayload.page);
            setHistoryMeta({ pageSize: historyPayload.pageSize, total: historyPayload.total, totalPages: historyPayload.totalPages });
            setContactedRecent(c);
            const firstTemplate = t[0];
            if (firstTemplate) {
                setSelectedTemplateId((prev) => prev || firstTemplate.id);
                if (!selectedTemplateId) {
                    setTemplateName(firstTemplate.name);
                    setMessage(firstTemplate.body);
                }
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
        }
        finally {
            setSyncing(false);
        }
    };
    useEffect(() => {
        void sync();
    }, []);
    useEffect(() => {
        if (!selectedTemplate)
            return;
        setTemplateName(selectedTemplate.name);
        setMessage(selectedTemplate.body);
        setTemplateStatus('idle');
    }, [selectedTemplateId, selectedTemplate?.updatedAt]);
    const saveTemplate = async () => {
        if (!selectedTemplate)
            return;
        const res = await fetch(`${API}/templates/${selectedTemplate.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: templateName, body: message })
        });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo guardar la plantilla.');
        }
        const updated = (await res.json());
        setTemplates((prev) => prev.map((template) => (template.id === updated.id ? updated : template)));
        setTemplateStatus('saved');
    };
    const handleTemplateChange = (nextId) => {
        if (templateStatus === 'dirty' && !window.confirm('Tenés cambios sin guardar. ¿Deseás descartarlos?'))
            return;
        setSelectedTemplateId(nextId);
    };
    const createTemplate = async () => {
        const name = window.prompt('Nombre de la nueva plantilla:');
        if (!name?.trim())
            return;
        const res = await fetch(`${API}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), body: message || 'Hola {nombre}, ' })
        });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo crear la plantilla.');
        }
        const created = (await res.json());
        setTemplates((prev) => [...prev, created]);
        setSelectedTemplateId(created.id);
        setTemplateStatus('saved');
    };
    const duplicateTemplate = async () => {
        if (!selectedTemplate)
            return;
        const res = await fetch(`${API}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `${templateName} (copia)`, body: message })
        });
        if (!res.ok)
            throw new Error('No se pudo duplicar la plantilla.');
        const duplicated = (await res.json());
        setTemplates((prev) => [...prev, duplicated]);
        setSelectedTemplateId(duplicated.id);
        setTemplateStatus('saved');
    };
    const deleteTemplate = async () => {
        if (!selectedTemplate || selectedTemplate.isDefault)
            return;
        if (!window.confirm('¿Eliminar plantilla seleccionada?'))
            return;
        const res = await fetch(`${API}/templates/${selectedTemplate.id}`, { method: 'DELETE' });
        if (!res.ok)
            throw new Error('No se pudo eliminar la plantilla.');
        const remaining = templates.filter((template) => template.id !== selectedTemplate.id);
        setTemplates(remaining);
        if (remaining[0])
            setSelectedTemplateId(remaining[0].id);
    };
    const resetDefaultTemplates = async () => {
        if (!window.confirm('Esto restaurará las plantillas predeterminadas y quitará las personalizadas.'))
            return;
        const res = await fetch(`${API}/templates/reset-defaults`, { method: 'POST' });
        if (!res.ok)
            throw new Error('No se pudieron restaurar plantillas.');
        const restored = (await res.json());
        setTemplates(restored);
        if (restored[0])
            setSelectedTemplateId(restored[0].id);
        setTemplateStatus('saved');
    };
    const baseRows = viewMode === 'debtors' ? debtors : members;
    const filtered = useMemo(() => {
        const normalizedQuery = query.toLowerCase();
        const filteredRows = baseRows.filter((d) => `${d.nombre} ${d.apellido}`.toLowerCase().includes(normalizedQuery) &&
            (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) &&
            (activityFilter === 'ALL' || d.actividad === activityFilter));
        return [...filteredRows].sort((a, b) => compareMembers(a, b, sortBy, sortDirection, contactedRecent.byMemberId));
    }, [baseRows, query, sheetFilter, activityFilter, sortBy, sortDirection, contactedRecent.byMemberId]);
    const changeSort = (nextSortBy) => {
        setSortBy((currentSortBy) => {
            if (currentSortBy === nextSortBy) {
                setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
                return currentSortBy;
            }
            setSortDirection(DEFAULT_SORT_DIRECTION);
            return nextSortBy;
        });
    };
    const resetSort = () => {
        setSortBy(DEFAULT_SORT_BY);
        setSortDirection(DEFAULT_SORT_DIRECTION);
    };
    const renderSortIndicator = (columnSortBy) => (sortBy === columnSortBy ? (sortDirection === 'asc' ? '↑' : '↓') : '');
    const visibleDebtors = filtered.filter((m) => m.estado === 'Adeudando');
    const allVisibleSelected = visibleDebtors.length > 0 && visibleDebtors.every((d) => selected.includes(d.id));
    const toggleAllDebtors = () => setSelected(allVisibleSelected
        ? selected.filter((id) => !visibleDebtors.some((f) => f.id === id))
        : Array.from(new Set([...selected, ...visibleDebtors.map((f) => f.id)])));
    const clearSelection = () => setSelected([]);
    const prepare = async () => {
        if (selected.length === 0) {
            setError('Seleccioná al menos un miembro Adeudando antes de preparar mensajes.');
            return;
        }
        setPreparing(true);
        setError(null);
        try {
            const validationRes = await fetch(`${API}/prepare-messages/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds: selected, message, mode: testMode ? 'test' : 'real', templateName: selectedTemplate?.name ?? templateName })
            });
            if (!validationRes.ok) {
                const payload = (await validationRes.json());
                throw new Error(payload.message ?? 'No se pudo validar la preparación de mensajes.');
            }
            const validation = (await validationRes.json());
            if (validation.missingPhoneMembers.length > 0) {
                throw new Error(`Hay ${validation.missingPhoneMembers.length} miembros sin teléfono válido.`);
            }
            if (validation.unresolvedVariables.length > 0) {
                throw new Error(`Hay variables sin reemplazar en el mensaje: ${validation.unresolvedVariables.join(', ')}`);
            }
            const previewClients = validation.selectedPreview.map((c) => c.nombre).join(', ');
            const duplicateWarning = validation.duplicates.length > 0 ? `\nAviso: ${validation.duplicates.length} clientes tienen mensajes recientes.` : '';
            const realWarning = validation.mode === 'real' && validation.selectedCount > 1 ? '\n⚠ Estás en modo real con más de 1 mensaje.' : '';
            const confirmText = `Confirmar preparación\nCantidad: ${validation.selectedCount}\nPrimeros clientes: ${previewClients}\nActividad: ${validation.selectedPreview[0]?.actividad ?? '-'}\nCuota: ${validation.selectedPreview[0]?.cuota ?? '-'}\nMensaje ejemplo: ${validation.sampleMessage}${duplicateWarning}${realWarning}`;
            if (!window.confirm(confirmText))
                return;
            const res = await fetch(`${API}/prepare-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds: selected, message, mode: testMode ? 'test' : 'real', templateName: selectedTemplate?.name ?? templateName })
            });
            if (!res.ok) {
                const payload = (await res.json());
                throw new Error(payload.message ?? 'No se pudieron preparar mensajes.');
            }
            setPrepared(await res.json());
            await loadHistory();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al preparar mensajes.');
        }
        finally {
            setPreparing(false);
        }
    };
    const updatePreparedStatus = async (historyId, status) => {
        if (!historyId)
            return;
        const res = await fetch(`${API}/history/${historyId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo actualizar el estado.');
        }
        setPrepared(prev => prev
            .map((item) => (item.historyId === historyId ? { ...item, status } : item))
            .filter((item) => ACTIONABLE_STATUSES.includes(item.status ?? 'prepared')));
        await loadHistory();
    };
    const openWhatsApp = async (item) => {
        window.open(item.waLink, '_blank', 'noopener,noreferrer');
        await updatePreparedStatus(item.historyId, 'opened');
    };
    const preparedCounts = prepared.reduce((acc, item) => {
        const key = item.status ?? 'prepared';
        acc[key] += 1;
        return acc;
    }, { prepared: 0, opened: 0, sent_manual: 0, skipped: 0 });
    const actionablePrepared = prepared.filter((item) => ACTIONABLE_STATUSES.includes(item.status ?? 'prepared'));
    const previewMember = members.find((d) => d.id === selected[0]);
    const preview = fill(message, previewMember);
    const canPrepare = selected.length > 0 && message.trim().length > 0 && !preparing;
    const syncMessage = !syncStatus
        ? 'Estado de sincronización no disponible'
        : syncStatus.error
            ? 'Google Sheets falló, usando datos mock'
            : syncStatus.source === 'google_sheets'
                ? 'Conectado a Google Sheets'
                : 'Usando datos mock';
    const allSheets = Array.from(new Set(members.map((d) => d.sourceSheet)));
    const allActivities = Array.from(new Set(members.map((d) => d.actividad).filter(Boolean)));
    return (_jsxs("main", { className: "container", children: [_jsxs("header", { className: "app-header", children: [_jsx("img", { src: "/logo/miClub - Logo trans.png", alt: "miClub", className: "club-logo" }), _jsxs("div", { children: [_jsx("h1", { children: "miClub WhatsApp CRM" }), _jsx("p", { children: "Gesti\u00F3n de cobranzas y mensajes por WhatsApp" })] })] }), _jsxs("div", { className: "actions-row", children: [_jsx("span", { className: `status-chip ${testMode ? 'status-chip--prepared' : 'status-chip--sent'}`, children: testMode ? 'Modo prueba activo' : 'Modo real activo' }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: !testMode, onChange: (e) => setTestMode(!e.target.checked) }), " Env\u00EDo real"] })] }), _jsxs("button", { className: "icon-btn", onClick: sync, disabled: syncing, children: [_jsx(Icon, { label: "\u21BB" }), syncing ? 'Sincronizando...' : 'Sincronizar'] }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), _jsxs("section", { className: "dashboard", children: [_jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDC65" }), "Total inscriptos"] }), _jsx("p", { children: summary?.totalMembers ?? members.length })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDCB3" }), "Total adeudando"] }), _jsx("p", { children: summary?.totalDebtors ?? debtors.length })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "$" }), "Deuda estimada"] }), _jsx("p", { children: formatArPeso(summary?.totalEstimatedDebt ?? 0) })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83E\uDDFE" }), "Deudores sin pagos registrados"] }), _jsx("p", { children: summary?.debtorsWithoutPayments ?? debtors.filter((d) => !d.lastPaymentAt).length })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDDC2" }), "Origen de datos"] }), _jsx("p", { children: syncMessage })] })] }), _jsxs("section", { className: "filters", children: [_jsxs("select", { value: viewMode, onChange: e => { setViewMode(e.target.value); setSelected([]); }, children: [_jsx("option", { value: "debtors", children: "Solo deudores" }), _jsx("option", { value: "members", children: "Todos los inscriptos" })] }), _jsx("input", { placeholder: "Buscar por nombre/apellido", value: query, onChange: e => setQuery(e.target.value) }), _jsxs("select", { value: sheetFilter, onChange: e => setSheetFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las hojas" }), allSheets.map(s => _jsx("option", { children: s }, s))] }), _jsxs("select", { value: activityFilter, onChange: e => setActivityFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las actividades" }), allActivities.map(s => _jsx("option", { children: s }, s))] })] }), _jsxs("section", { className: "sort-controls", "aria-label": "Controles de ordenamiento", children: [_jsxs("label", { children: ["Ordenar por", _jsx("select", { value: sortBy, onChange: (e) => setSortBy(e.target.value), children: SORT_OPTIONS.map((option) => _jsx("option", { value: option.value, children: option.label }, option.value)) })] }), _jsxs("label", { children: ["Direcci\u00F3n", _jsxs("select", { value: sortDirection, onChange: (e) => setSortDirection(e.target.value), children: [_jsx("option", { value: "asc", children: "Ascendente" }), _jsx("option", { value: "desc", children: "Descendente" })] })] }), _jsxs("button", { className: "icon-btn ghost-btn", onClick: resetSort, children: [_jsx(Icon, { label: "\u21BA" }), "Restablecer orden"] }), _jsxs("p", { className: "sort-summary", children: ["Ordenando por: ", SORT_LABEL_BY_VALUE[sortBy], " \u00B7 ", sortDirection === 'asc' ? 'Ascendente' : 'Descendente'] })] }), _jsxs("div", { className: "actions-row", children: [_jsxs("p", { children: [_jsx("strong", { children: "Resultados visibles:" }), " ", filtered.length, " \u00B7 ", _jsx("strong", { children: "Seleccionados:" }), " ", selected.length, " \u00B7 ", _jsx("strong", { children: "Contactados \u00FAltimos 30 d\u00EDas:" }), " ", contactedRecent.memberIds.length] }), _jsxs("button", { className: "icon-btn", onClick: toggleAllDebtors, children: [_jsx(Icon, { label: "\u2611" }), "Seleccionar todos los visibles"] }), _jsxs("button", { className: "icon-btn", onClick: clearSelection, children: [_jsx(Icon, { label: "\u232B" }), "Limpiar selecci\u00F3n"] })] }), filtered.length === 0 ? _jsx("p", { children: "No hay resultados con los filtros actuales." }) : _jsx("div", { className: "members-table-wrap", children: _jsxs("table", { className: "members-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('nombre'), children: ["Nombre ", renderSortIndicator('nombre')] }) }), _jsx("th", { children: "Tel\u00E9fono" }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('actividad'), children: ["Actividad ", renderSortIndicator('actividad')] }) }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('cuota'), children: ["Cuota ", renderSortIndicator('cuota')] }) }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('lastPaymentAt'), children: ["\u00DAltimo pago ", renderSortIndicator('lastPaymentAt')] }) }), _jsx("th", { children: "Instructor" }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('sourceSheet'), children: ["Hoja ", renderSortIndicator('sourceSheet')] }) }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('estado'), children: ["Estado ", renderSortIndicator('estado')] }) }), _jsx("th", { children: _jsxs("button", { className: "sortable-header", onClick: () => changeSort('lastContactAt'), children: ["Contacto ", renderSortIndicator('lastContactAt')] }) })] }) }), _jsx("tbody", { children: filtered.map(m => { const recent = contactedRecent.byMemberId[m.id]; return _jsxs("tr", { className: recent ? 'recent-contact-row' : '', children: [_jsx("td", { children: _jsx("input", { type: "checkbox", disabled: m.estado !== 'Adeudando', checked: selected.includes(m.id), onChange: () => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]) }) }), _jsxs("td", { children: [m.nombre, " ", m.apellido] }), _jsx("td", { children: m.telefono }), _jsx("td", { children: m.actividad ?? '-' }), _jsx("td", { children: m.cuota !== undefined ? formatArPeso(m.cuota) : '-' }), _jsx("td", { children: _jsx("span", { className: m.lastPaymentAt ? 'last-payment-badge' : 'last-payment-badge last-payment-badge--empty', title: m.lastPaymentConcept ? `Concepto: ${m.lastPaymentConcept}` : undefined, children: formatLastPayment(m) }) }), _jsx("td", { children: m.instructor ?? '-' }), _jsx("td", { children: m.sourceSheet }), _jsx("td", { children: m.estado }), _jsx("td", { children: recent ? _jsxs("span", { className: "recent-contact-badge", title: "Mensaje enviado en los \u00FAltimos 30 d\u00EDas", children: ["\uD83D\uDCE9 Contactado: ", new Date(recent.lastSentAt).toLocaleDateString('es-AR')] }) : '-' })] }, m.id); }) })] }) }), _jsxs("section", { className: "composer", children: [_jsx("select", { onChange: (e) => handleTemplateChange(e.target.value), value: selectedTemplateId, children: templates.map(t => _jsx("option", { value: t.id, children: t.name }, t.id)) }), _jsx("input", { value: templateName, onChange: (e) => { setTemplateName(e.target.value); setTemplateStatus('dirty'); }, placeholder: "Nombre de plantilla" }), _jsx("textarea", { value: message, onChange: e => { setMessage(e.target.value); setTemplateStatus('dirty'); }, rows: 5 }), _jsxs("p", { children: [_jsx("strong", { children: "Estado:" }), " ", templateStatus === 'dirty' ? 'Cambios sin guardar' : templateStatus === 'saved' ? 'Plantilla guardada' : 'Sin cambios'] }), _jsxs("div", { className: "actions-row", children: [_jsxs("button", { className: "icon-btn", onClick: () => void saveTemplate(), disabled: !selectedTemplate || templateStatus !== 'dirty', children: [_jsx(Icon, { label: "\uD83D\uDCBE" }), "Guardar cambios"] }), _jsxs("button", { className: "icon-btn", onClick: () => void createTemplate(), children: [_jsx(Icon, { label: "\uFF0B" }), "Crear plantilla"] }), _jsxs("button", { className: "icon-btn", onClick: () => void duplicateTemplate(), disabled: !selectedTemplate, children: [_jsx(Icon, { label: "\u29C9" }), "Duplicar plantilla"] }), !selectedTemplate?.isDefault && _jsxs("button", { className: "icon-btn", onClick: () => void deleteTemplate(), children: [_jsx(Icon, { label: "\uD83D\uDDD1" }), "Eliminar plantilla"] }), _jsxs("button", { className: "icon-btn ghost-btn", onClick: () => void resetDefaultTemplates(), children: [_jsx(Icon, { label: "\u21BA" }), "Restaurar plantillas predeterminadas"] })] }), _jsx("h3", { children: "Vista previa" }), _jsx("pre", { children: preview }), _jsxs("button", { className: "icon-btn", disabled: !canPrepare, onClick: prepare, children: [_jsx(Icon, { label: "\u2709" }), preparing ? 'Preparando...' : 'Preparar mensajes'] })] }), _jsxs("section", { className: "section-panel", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Mensajes preparados" }), _jsx("p", { children: "Gestion\u00E1 los mensajes listos para enviar y movelos al historial cuando finalices." })] }), _jsxs("button", { className: "icon-btn ghost-btn", onClick: () => setPrepared([]), children: [_jsx(Icon, { label: "\u232B" }), "Limpiar mensajes preparados de pantalla"] })] }), _jsx("p", { className: "section-note", children: "Esta acci\u00F3n solo limpia la pantalla actual y no borra historial." }), _jsxs("div", { className: "count-chips", children: [_jsxs("span", { className: "status-chip status-chip--prepared", children: ["Pendientes: ", preparedCounts.prepared] }), _jsxs("span", { className: "status-chip status-chip--opened", children: ["Abiertos: ", preparedCounts.opened] }), _jsxs("span", { className: "status-chip status-chip--sent", children: ["Enviados: ", preparedCounts.sent_manual] }), _jsxs("span", { className: "status-chip status-chip--skipped", children: ["Omitidos: ", preparedCounts.skipped] })] }), actionablePrepared.length === 0 ? (_jsxs("div", { className: "empty-state", children: [_jsx("div", { className: "empty-state-icon", children: "\uD83D\uDCED" }), _jsx("p", { className: "empty-state-title", children: "No hay mensajes pendientes" }), _jsx("p", { children: "Prepar\u00E1 mensajes desde la lista de deudores para gestionarlos ac\u00E1." })] })) : (_jsx("div", { className: "prepared-grid", children: actionablePrepared.map((p) => (_jsxs("article", { className: "prepared-card", children: [_jsxs("div", { className: "prepared-header", children: [_jsx("h4", { children: p.nombre ?? p.memberId }), _jsxs("span", { className: `status-chip ${getStatusClass(p.status)}`, children: [_jsx(Icon, { label: getStatusIcon(p.status) }), getStatusLabel(p.status)] })] }), _jsxs("p", { className: "prepared-meta", children: [_jsx("strong", { children: "Tel\u00E9fono destino:" }), " ", p.phone] }), testMode && _jsxs("p", { className: "prepared-meta", children: [_jsx("strong", { children: "Cliente real:" }), " ", (members.find((m) => m.id === p.memberId)?.telefono) ?? '-'] }), _jsxs("p", { className: "prepared-meta", children: [_jsx("strong", { children: "Actividad:" }), " ", p.actividad ?? '-'] }), _jsxs("div", { className: "actions-row prepared-actions", children: [_jsxs("button", { className: "icon-btn", onClick: () => void openWhatsApp(p), children: [_jsx(Icon, { label: "\u2197" }), "Abrir WhatsApp"] }), _jsxs("button", { className: "icon-btn", onClick: () => void updatePreparedStatus(p.historyId, 'sent_manual'), children: [_jsx(Icon, { label: "\u2713" }), "Marcar enviado"] }), _jsxs("button", { className: "icon-btn", onClick: () => void updatePreparedStatus(p.historyId, 'skipped'), children: [_jsx(Icon, { label: "\u2715" }), "Omitir"] })] })] }, `${p.historyId ?? p.memberId}-${p.createdAt}`))) }))] }), _jsxs("section", { className: "section-panel", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Historial" }), _jsx("p", { children: "\u00DAltimos 200 movimientos (20 por p\u00E1gina)" })] }), _jsxs("button", { className: "icon-btn ghost-btn", onClick: () => void loadHistory(), children: [_jsx(Icon, { label: "\u25F4" }), "Actualizar historial"] })] }), history.length === 0 ? (_jsxs("div", { className: "empty-state", children: [_jsx("div", { className: "empty-state-icon", children: "\uD83D\uDDC2" }), _jsx("p", { className: "empty-state-title", children: "A\u00FAn no hay movimientos" }), _jsx("p", { children: "Cuando prepares o gestiones mensajes, aparecer\u00E1n en este historial." })] })) : (_jsx("div", { className: "history-table-wrap", children: _jsxs("table", { className: "history-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Estado" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Tel\u00E9fono" }), _jsx("th", { children: "Mensaje" }), _jsx("th", { children: "Actividad" })] }) }), _jsx("tbody", { children: history.map((h) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("span", { className: `status-chip ${getStatusClass(h.status)}`, children: [_jsx(Icon, { label: getStatusIcon(h.status) }), getStatusLabel(h.status)] }) }), _jsx("td", { children: formatDateTime(h.createdAt) }), _jsx("td", { children: h.nombre ?? h.memberId }), _jsx("td", { children: h.phone }), _jsx("td", { children: _jsx("div", { className: "history-message-card", children: _jsx("p", { className: "history-message-preview", children: h.templateName?.trim() || 'Recordatorio amable' }) }) }), _jsx("td", { children: h.actividad ?? '-' })] }, `${h.historyId ?? h.memberId}-${h.createdAt}`))) })] }) })), _jsxs("div", { className: "history-pagination", children: [_jsx("button", { className: "icon-btn ghost-btn", disabled: historyPage <= 1, onClick: () => void loadHistory(historyPage - 1), children: "Anterior" }), _jsxs("span", { children: ["P\u00E1gina ", historyMeta.totalPages === 0 ? 0 : historyPage, " de ", historyMeta.totalPages] }), _jsx("button", { className: "icon-btn ghost-btn", disabled: historyPage >= historyMeta.totalPages, onClick: () => void loadHistory(historyPage + 1), children: "Siguiente" })] })] })] }));
}
