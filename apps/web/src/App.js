import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatArPeso } from './utils';
const Icon = ({ label }) => _jsx("span", { "aria-hidden": "true", className: "mini-icon", children: label });
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
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
export default function App() {
    // ...
    const [members, setMembers] = useState([]);
    const [debtors, setDebtors] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [summary, setSummary] = useState(null);
    const [selected, setSelected] = useState([]);
    const [query, setQuery] = useState('');
    const [sheetFilter, setSheetFilter] = useState('ALL');
    const [activityFilter, setActivityFilter] = useState('ALL');
    const [viewMode, setViewMode] = useState('debtors');
    const [message, setMessage] = useState('');
    const [prepared, setPrepared] = useState([]);
    const [history, setHistory] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState(null);
    const loadHistory = async () => {
        const res = await fetch(`${API}/history`);
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo cargar el historial.');
        }
        const rows = (await res.json());
        setHistory(rows.slice(0, 20));
    };
    const sync = async () => {
        setSyncing(true);
        setError(null);
        try {
            const [mRes, dRes, tRes, sRes, sumRes, hRes] = await Promise.all([
                fetch(`${API}/members`),
                fetch(`${API}/debtors`),
                fetch(`${API}/templates`),
                fetch(`${API}/sync-status`),
                fetch(`${API}/summary`),
                fetch(`${API}/history`)
            ]);
            if (!mRes.ok || !dRes.ok || !tRes.ok || !sRes.ok || !sumRes.ok || !hRes.ok) {
                throw new Error('No se pudo sincronizar la información.');
            }
            const [m, d, t, s, sum, h] = await Promise.all([
                mRes.json(),
                dRes.json(),
                tRes.json(),
                sRes.json(),
                sumRes.json(),
                hRes.json()
            ]);
            setMembers(m);
            setDebtors(d);
            setTemplates(t);
            setSyncStatus(s);
            setSummary(sum);
            setHistory(h.slice(0, 20));
            if (!message && t[0])
                setMessage(t[0].body);
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
    const baseRows = viewMode === 'debtors' ? debtors : members;
    const filtered = useMemo(() => baseRows.filter((d) => `${d.nombre} ${d.apellido}`.toLowerCase().includes(query.toLowerCase()) &&
        (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) &&
        (activityFilter === 'ALL' || d.actividad === activityFilter)), [baseRows, query, sheetFilter, activityFilter]);
    const visibleDebtors = filtered.filter((m) => m.estado === 'Adeudando');
    const allVisibleSelected = visibleDebtors.length > 0 && visibleDebtors.every((d) => selected.includes(d.id));
    const toggleAllDebtors = () => setSelected(allVisibleSelected
        ? selected.filter((id) => !visibleDebtors.some((f) => f.id === id))
        : Array.from(new Set([...selected, ...visibleDebtors.map((f) => f.id)])));
    const clearSelection = () => setSelected([]);
    const prepare = async () => {
        setPreparing(true);
        setError(null);
        try {
            const res = await fetch(`${API}/prepare-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds: selected, message })
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
    return (_jsxs("main", { className: "container", children: [_jsxs("header", { className: "app-header", children: [_jsx("img", { src: "/logo/miClub - Logo trans.png", alt: "miClub", className: "club-logo" }), _jsxs("div", { children: [_jsx("h1", { children: "miClub WhatsApp CRM" }), _jsx("p", { children: "Gesti\u00F3n de cobranzas y mensajes por WhatsApp" })] })] }), _jsxs("button", { className: "icon-btn", onClick: sync, disabled: syncing, children: [_jsx(Icon, { label: "\u21BB" }), syncing ? 'Sincronizando...' : 'Sincronizar'] }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), _jsxs("section", { className: "dashboard", children: [_jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDC65" }), "Total inscriptos"] }), _jsx("p", { children: summary?.totalMembers ?? members.length })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDCB3" }), "Total adeudando"] }), _jsx("p", { children: summary?.totalDebtors ?? debtors.length })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "$" }), "Deuda estimada"] }), _jsx("p", { children: formatArPeso(summary?.totalEstimatedDebt ?? 0) })] }), _jsxs("article", { className: "card", children: [_jsxs("h4", { children: [_jsx(Icon, { label: "\uD83D\uDDC2" }), "Origen de datos"] }), _jsx("p", { children: syncMessage })] })] }), _jsxs("section", { className: "filters", children: [_jsxs("select", { value: viewMode, onChange: e => { setViewMode(e.target.value); setSelected([]); }, children: [_jsx("option", { value: "debtors", children: "Solo deudores" }), _jsx("option", { value: "members", children: "Todos los inscriptos" })] }), _jsx("input", { placeholder: "Buscar por nombre/apellido", value: query, onChange: e => setQuery(e.target.value) }), _jsxs("select", { value: sheetFilter, onChange: e => setSheetFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las hojas" }), allSheets.map(s => _jsx("option", { children: s }, s))] }), _jsxs("select", { value: activityFilter, onChange: e => setActivityFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las actividades" }), allActivities.map(s => _jsx("option", { children: s }, s))] })] }), _jsxs("div", { className: "actions-row", children: [_jsxs("p", { children: [_jsx("strong", { children: "Resultados visibles:" }), " ", filtered.length, " \u00B7 ", _jsx("strong", { children: "Seleccionados:" }), " ", selected.length] }), _jsxs("button", { className: "icon-btn", onClick: toggleAllDebtors, children: [_jsx(Icon, { label: "\u2611" }), "Seleccionar todos los visibles"] }), _jsxs("button", { className: "icon-btn", onClick: clearSelection, children: [_jsx(Icon, { label: "\u232B" }), "Limpiar selecci\u00F3n"] })] }), filtered.length === 0 ? _jsx("p", { children: "No hay resultados con los filtros actuales." }) : _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "Tel\u00E9fono" }), _jsx("th", { children: "Actividad" }), _jsx("th", { children: "Cuota" }), _jsx("th", { children: "Instructor" }), _jsx("th", { children: "Hoja" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: filtered.map(m => _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", disabled: m.estado !== 'Adeudando', checked: selected.includes(m.id), onChange: () => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]) }) }), _jsxs("td", { children: [m.nombre, " ", m.apellido] }), _jsx("td", { children: m.telefono }), _jsx("td", { children: m.actividad ?? '-' }), _jsx("td", { children: m.cuota ? formatArPeso(m.cuota) : '-' }), _jsx("td", { children: m.instructor ?? '-' }), _jsx("td", { children: m.sourceSheet }), _jsx("td", { children: m.estado })] }, m.id)) })] }), _jsxs("section", { className: "composer", children: [_jsx("select", { onChange: (e) => setMessage(e.target.value), value: message, children: templates.map(t => _jsx("option", { value: t.body, children: t.name }, t.id)) }), _jsx("textarea", { value: message, onChange: e => setMessage(e.target.value), rows: 5 }), _jsx("h3", { children: "Vista previa" }), _jsx("pre", { children: preview }), _jsxs("button", { className: "icon-btn", disabled: !canPrepare, onClick: prepare, children: [_jsx(Icon, { label: "\u2709" }), preparing ? 'Preparando...' : 'Preparar mensajes'] })] }), _jsxs("section", { children: [_jsx("h3", { children: "Mensajes preparados" }), prepared.map(p => _jsx("div", { children: _jsxs("a", { href: p.waLink, target: "_blank", rel: "noreferrer", children: [_jsx(Icon, { label: "\u2197" }), "Abrir WhatsApp - ", p.phone] }) }, `${p.memberId}-${p.createdAt}`))] }), _jsxs("section", { children: [_jsx("h3", { children: "Historial (\u00FAltimos 20)" }), _jsxs("button", { className: "icon-btn", onClick: () => void loadHistory(), children: [_jsx(Icon, { label: "\u25F4" }), "Actualizar historial"] }), history.length === 0 ? _jsx("p", { children: "Sin historial todav\u00EDa." }) : history.map(h => _jsxs("article", { children: [_jsxs("p", { children: [_jsx("strong", { children: new Date(h.createdAt).toLocaleString() }), " \u00B7 ", h.phone] }), _jsx("p", { children: h.message }), _jsx("a", { href: h.waLink, target: "_blank", rel: "noreferrer", children: h.waLink })] }, `${h.memberId}-${h.createdAt}`))] })] }));
}
