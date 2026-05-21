import { useEffect, useMemo, useState } from 'react';
import type { Member, MessageTemplate, PreparedMessage } from '@miclub/shared';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const fill = (tpl: string, m?: Member) => {
  if (!m) return tpl;

  const values: Record<string, string> = {
    nombre: m.nombre,
    apellido: m.apellido,
    actividad: m.actividad ?? '',
    modalidad: m.modalidad ?? '',
    cuota: m.cuota?.toString() ?? '',
    instructor: m.instructor ?? ''
  };

  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
};

export default function App() {
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [prepared, setPrepared] = useState<PreparedMessage[]>([]);

  const sync = async () => {
    const [d, t] = await Promise.all([fetch(`${API}/debtors`).then(r => r.json()), fetch(`${API}/templates`).then(r => r.json())]);
    setDebtors(d); setTemplates(t); if (!message && t[0]) setMessage(t[0].body);
  };

  useEffect(() => { sync(); }, []);

  const filtered = useMemo(() => debtors.filter(d => `${d.nombre} ${d.apellido}`.toLowerCase().includes(query.toLowerCase()) && (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) && (activityFilter === 'ALL' || d.actividad === activityFilter)), [debtors, query, sheetFilter, activityFilter]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));

  const toggleAll = () => setSelected(allVisibleSelected ? selected.filter(id => !filtered.some(f => f.id === id)) : Array.from(new Set([...selected, ...filtered.map(f => f.id)])));

  const prepare = async () => {
    const res = await fetch(`${API}/prepare-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: selected, message }) });
    setPrepared(await res.json());
  };

  return <main className="container"><h1>miClub WhatsApp CRM</h1><p>Gestión de cobranzas y mensajes por WhatsApp</p><button onClick={sync}>Sincronizar</button>
  <section className="filters"><input placeholder="Buscar por nombre/apellido" value={query} onChange={e => setQuery(e.target.value)} />
  <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}><option value="ALL">Todas las hojas</option>{Array.from(new Set(debtors.map(d => d.sourceSheet))).map(s => <option key={s}>{s}</option>)}</select>
  <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="ALL">Todas las actividades</option>{Array.from(new Set(debtors.map(d => d.actividad).filter(Boolean))).map(s => <option key={s}>{s}</option>)}</select></section>
  <table><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th><th>Nombre</th><th>Actividad</th><th>Hoja</th><th>Estado</th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><input type="checkbox" checked={selected.includes(m.id)} onChange={() => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} /></td><td>{m.nombre} {m.apellido}</td><td>{m.actividad}</td><td>{m.sourceSheet}</td><td>{m.estado}</td></tr>)}</tbody></table>
  <section><select onChange={(e) => setMessage(e.target.value)} value={message}>{templates.map(t => <option key={t.id} value={t.body}>{t.name}</option>)}</select>
  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
  <h3>Vista previa</h3><p>{fill(message, debtors.find(d => d.id === selected[0]))}</p>
  <button disabled={!selected.length} onClick={prepare}>Preparar mensajes</button></section>
  <section>{prepared.map(p => <div key={p.memberId}><a href={p.waLink} target="_blank">Abrir WhatsApp - {p.phone}</a></div>)}</section></main>;
}
