import { useEffect, useMemo, useState } from 'react';
import type { Member, MessageTemplate, PreparedMessage } from '@miclub/shared';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type ApiError = { error: true; message: string };
type SyncStatus = {
  source: 'mock' | 'google_sheets';
  enabled: boolean;
  sheets: string[];
  lastSyncAt?: string;
  error?: string;
};

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
  const [history, setHistory] = useState<PreparedMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const [dRes, tRes, sRes] = await Promise.all([fetch(`${API}/debtors`), fetch(`${API}/templates`), fetch(`${API}/sync-status`)]);
      if (!dRes.ok || !tRes.ok || !sRes.ok) throw new Error('No se pudo sincronizar la información.');
      const [d, t, s] = await Promise.all([dRes.json(), tRes.json(), sRes.json()]);
      setDebtors(d);
      setTemplates(t);
      setSyncStatus(s as SyncStatus);
      if (!message && t[0]) setMessage(t[0].body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  const loadHistory = async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/history`);
      if (!res.ok) {
        const payload = (await res.json()) as ApiError;
        throw new Error(payload.message ?? 'No se pudo cargar el historial.');
      }
      setHistory(await res.json());
    } catch (e) {
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
        const payload = (await res.json()) as ApiError;
        throw new Error(payload.message ?? 'No se pudieron preparar mensajes.');
      }
      setPrepared(await res.json());
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al preparar mensajes.');
    } finally {
      setPreparing(false);
    }
  };

  const previewMember = debtors.find(d => d.id === selected[0]);
  const preview = fill(message, previewMember);
  const canPrepare = selected.length > 0 && message.trim().length > 0 && !preparing;
  const syncMessage = !syncStatus
    ? 'Estado de sincronización no disponible'
    : syncStatus.error
      ? 'Google Sheets falló, usando datos mock'
      : syncStatus.source === 'google_sheets'
        ? 'Conectado a Google Sheets'
        : 'Usando datos mock';

  return <main className="container"><h1>miClub WhatsApp CRM</h1><p>Gestión de cobranzas y mensajes por WhatsApp</p><button onClick={sync} disabled={syncing}>{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
  <p><strong>Origen de datos:</strong> {syncMessage}</p>
  {error && <p style={{ color: 'crimson', fontWeight: 700 }}>Error: {error}</p>}
  <section className="filters"><input placeholder="Buscar por nombre/apellido" value={query} onChange={e => setQuery(e.target.value)} />
  <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}><option value="ALL">Todas las hojas</option>{Array.from(new Set(debtors.map(d => d.sourceSheet))).map(s => <option key={s}>{s}</option>)}</select>
  <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="ALL">Todas las actividades</option>{Array.from(new Set(debtors.map(d => d.actividad).filter(Boolean))).map(s => <option key={s}>{s}</option>)}</select></section>
  <p><strong>Seleccionados:</strong> {selected.length}</p>
  <table><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th><th>Nombre</th><th>Actividad</th><th>Hoja</th><th>Estado</th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><input type="checkbox" checked={selected.includes(m.id)} onChange={() => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} /></td><td>{m.nombre} {m.apellido}</td><td>{m.actividad}</td><td>{m.sourceSheet}</td><td>{m.estado}</td></tr>)}</tbody></table>
  <section><select onChange={(e) => setMessage(e.target.value)} value={message}>{templates.map(t => <option key={t.id} value={t.body}>{t.name}</option>)}</select>
  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
  <h3>Vista previa</h3><pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 8 }}>{preview}</pre>
  <button disabled={!canPrepare} onClick={prepare}>{preparing ? 'Preparando...' : 'Preparar mensajes'}</button></section>
  <section><h3>Mensajes preparados</h3>{prepared.map(p => <div key={`${p.memberId}-${p.createdAt}`}><a href={p.waLink} target="_blank" rel="noreferrer">Abrir WhatsApp - {p.phone}</a></div>)}</section>
  <section><h3>Historial</h3><button onClick={loadHistory}>Actualizar historial</button>{history.length === 0 ? <p>Sin historial todavía.</p> : history.map(h => <article key={`${h.memberId}-${h.createdAt}`}><p><strong>{h.phone}</strong> · {new Date(h.createdAt).toLocaleString()}</p><p>{h.message}</p><a href={h.waLink} target="_blank" rel="noreferrer">Abrir enlace</a></article>)}</section></main>;
}
