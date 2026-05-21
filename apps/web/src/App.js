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
    const sync = async () => {
        const [d, t] = await Promise.all([fetch(`${API}/debtors`).then(r => r.json()), fetch(`${API}/templates`).then(r => r.json())]);
        setDebtors(d);
        setTemplates(t);
        if (!message && t[0])
            setMessage(t[0].body);
    };
    useEffect(() => { sync(); }, []);
    const filtered = useMemo(() => debtors.filter(d => `${d.nombre} ${d.apellido}`.toLowerCase().includes(query.toLowerCase()) && (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) && (activityFilter === 'ALL' || d.actividad === activityFilter)), [debtors, query, sheetFilter, activityFilter]);
    const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));
    const toggleAll = () => setSelected(allVisibleSelected ? selected.filter(id => !filtered.some(f => f.id === id)) : Array.from(new Set([...selected, ...filtered.map(f => f.id)])));
    const prepare = async () => {
        const res = await fetch(`${API}/prepare-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: selected, message }) });
        setPrepared(await res.json());
    };
    return _jsxs("main", { className: "container", children: [_jsx("h1", { children: "miClub WhatsApp CRM" }), _jsx("p", { children: "Gesti\u00F3n de cobranzas y mensajes por WhatsApp" }), _jsx("button", { onClick: sync, children: "Sincronizar" }), _jsxs("section", { className: "filters", children: [_jsx("input", { placeholder: "Buscar por nombre/apellido", value: query, onChange: e => setQuery(e.target.value) }), _jsxs("select", { value: sheetFilter, onChange: e => setSheetFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las hojas" }), Array.from(new Set(debtors.map(d => d.sourceSheet))).map(s => _jsx("option", { children: s }, s))] }), _jsxs("select", { value: activityFilter, onChange: e => setActivityFilter(e.target.value), children: [_jsx("option", { value: "ALL", children: "Todas las actividades" }), Array.from(new Set(debtors.map(d => d.actividad).filter(Boolean))).map(s => _jsx("option", { children: s }, s))] })] }), _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: _jsx("input", { type: "checkbox", checked: allVisibleSelected, onChange: toggleAll }) }), _jsx("th", { children: "Nombre" }), _jsx("th", { children: "Actividad" }), _jsx("th", { children: "Hoja" }), _jsx("th", { children: "Estado" })] }) }), _jsx("tbody", { children: filtered.map(m => _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: selected.includes(m.id), onChange: () => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]) }) }), _jsxs("td", { children: [m.nombre, " ", m.apellido] }), _jsx("td", { children: m.actividad }), _jsx("td", { children: m.sourceSheet }), _jsx("td", { children: m.estado })] }, m.id)) })] }), _jsxs("section", { children: [_jsx("select", { onChange: (e) => setMessage(e.target.value), value: message, children: templates.map(t => _jsx("option", { value: t.body, children: t.name }, t.id)) }), _jsx("textarea", { value: message, onChange: e => setMessage(e.target.value), rows: 5 }), _jsx("h3", { children: "Vista previa" }), _jsx("p", { children: fill(message, debtors.find(d => d.id === selected[0])) }), _jsx("button", { disabled: !selected.length, onClick: prepare, children: "Preparar mensajes" })] }), _jsx("section", { children: prepared.map(p => _jsx("div", { children: _jsxs("a", { href: p.waLink, target: "_blank", children: ["Abrir WhatsApp - ", p.phone] }) }, p.memberId)) })] });
}
