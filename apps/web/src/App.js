import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const fill = (tpl, m) => {
    if (!m)
        return tpl;
    const values = {
        nombre: m.nombre,
        apellido: m.apellido,
        actividad: m.actividad ?? '',
        modalidad: m.modalidad ?? '',
        cuota: m.cuota?.toString() ?? '',
        instructor: m.instructor ?? ''
    };
    return tpl.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};
export default function App() {
    const [debtors, setDebtors] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selected, setSelected] = useState([]);
    const [query, setQuery] = useState('');
    const [sheetFilter, setSheetFilter] = useState('ALL');
    const [activityFilter, setActivityFilter] = useState('ALL');
    const [message, setMessage] = useState('');
    const [prepared, setPrepared] = useState([]);
    const [history, setHistory] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState(null);
    const sync = async () => {
        setSyncing(true);
        setError(null);
        try {
            const [dRes, tRes] = await Promise.all([fetch(`${API}/debtors`), fetch(`${API}/templates`)]);
            if (!dRes.ok || !tRes.ok)
                throw new Error('No se pudo sincronizar la información.');
            const [d, t] = await Promise.all([dRes.json(), tRes.json()]);
            setDebtors(d);
            setTemplates(t);
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
    const loadHistory = async () => {
        setError(null);
        try {
            const res = await fetch(`${API}/history`);
            if (!res.ok) {
                const payload = (await res.json());
                throw new Error(payload.message ?? 'No se pudo cargar el historial.');
            }
            setHistory(await res.json());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al cargar historial.');
        }
    };
    useEffect(() => {
        void sync();
        void loadHistory();
    }, []);
    const filtered = useMemo(() => debtors.filter(d => `${d.nombre} ${d.apellido}`.toLowerCase().includes(query.toLowerCase()) && (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) && (activityFilter === 'ALL' || d.actividad === activityFilter)), [debtors, query, sheetFilter, activityFilter]);
    const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));
    const toggleAll = () => setSelected(allVisibleSelected ? selected.filter(id => !filtered.some(f => f.id === id)) : Array.from(new Set([...selected, ...filtered.map(f => f.id)])));
    const prepare = async () => {
        setPreparing(true);
        setError(null);
        try {
            const res = await fetch(`${API}/prepare-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: selected, message }) });
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
    const previewMember = debtors.find(d => d.id === selected[0]);
    const preview = fill(message, previewMember);
    const canPrepare = selected.length > 0 && message.trim().length > 0 && !preparing;
    return _jsxs("main", { className: "container", children: [_jsx("h1", { children: "miClub WhatsApp CRM" }), _jsx("p", { children: "Gesti\u00F3n de cobranzas y mensajes por WhatsApp" }), _jsx("button", { onClick: sync, disabled: syncing, children: syncing ? 'Sincronizando...' : 'Sincronizar' }), error && _jsxs("p", { style: { color: 'crimson', fontWeight: 700 }, children: ["Error: ", error] }), _jsxs("section", { className: "filters", children: [_jsx("input", { placeholder: "Buscar por nombre/apellido", value: query, onChange: e => setQuery(e.target.value) }), _jsxs("select", { value: sheetFilter, onChange: e => setSheetFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las hojas" }), Array.from(new Set(debtors.map(d => d.sourceSheet))).map(s => _jsx("option", { children: s }, s))] }), _jsxs("select", { value: activityFilter, onChange: e => setActivityFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las actividades" }), Array.from(new Set(debtors.map(d => d.actividad).filter(Boolean))).map(s => _jsx("option", { children: s }, s))] })] }), _jsxs("p", { children: [_jsx("strong", { children: "Seleccionados:" }), " ", selected.length] }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: _jsx("input", { type: "checkbox", checked: allVisibleSelected, onChange: toggleAll }) }), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "Actividad" }), _jsx("th", { children: "Hoja" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: filtered.map(m => _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: selected.includes(m.id), onChange: () => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]) }) }), _jsxs("td", { children: [m.nombre, " ", m.apellido] }), _jsx("td", { children: m.actividad }), _jsx("td", { children: m.sourceSheet }), _jsx("td", { children: m.estado })] }, m.id)) })] }), _jsxs("section", { children: [_jsx("select", { onChange: (e) => setMessage(e.target.value), value: message, children: templates.map(t => _jsx("option", { value: t.body, children: t.name }, t.id)) }), _jsx("textarea", { value: message, onChange: e => setMessage(e.target.value), rows: 5 }), _jsx("h3", { children: "Vista previa" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 8 }, children: preview }), _jsx("button", { disabled: !canPrepare, onClick: prepare, children: preparing ? 'Preparando...' : 'Preparar mensajes' })] }), _jsxs("section", { children: [_jsx("h3", { children: "Mensajes preparados" }), prepared.map(p => _jsx("div", { children: _jsxs("a", { href: p.waLink, target: "_blank", rel: "noreferrer", children: ["Abrir WhatsApp - ", p.phone] }) }, `${p.memberId}-${p.createdAt}`))] }), _jsxs("section", { children: [_jsx("h3", { children: "Historial" }), _jsx("button", { onClick: loadHistory, children: "Actualizar historial" }), history.length === 0 ? _jsx("p", { children: "Sin historial todav\u00EDa." }) : history.map(h => _jsxs("article", { children: [_jsxs("p", { children: [_jsx("strong", { children: h.phone }), " \u00B7 ", new Date(h.createdAt).toLocaleString()] }), _jsx("p", { children: h.message }), _jsx("a", { href: h.waLink, target: "_blank", rel: "noreferrer", children: "Abrir enlace" })] }, `${h.memberId}-${h.createdAt}`))] })] });
}
