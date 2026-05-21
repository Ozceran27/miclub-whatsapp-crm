import { useEffect, useMemo, useState } from 'react';
import type { Member, MessageTemplate, PreparedMessage } from '@miclub/shared';
import { formatArPeso } from './utils';

const Icon = ({ label }: { label: string }) => <span aria-hidden="true" className="mini-icon">{label}</span>;


const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type ApiError = { error: true; message: string };
type SyncStatus = {
  source: 'mock' | 'google_sheets';
  enabled: boolean;
  sheets: string[];
  lastSyncAt?: string;
  error?: string;
};
type Summary = {
  totalMembers: number;
  totalDebtors: number;
  totalEstimatedDebt: number;
};
type ViewMode = 'debtors' | 'members';
type MessageStatus = 'prepared' | 'opened' | 'sent_manual' | 'skipped';

const fill = (tpl: string, m?: Member) => {
  if (!m) return tpl;
  const values: Record<string, string> = {
    nombre: m.nombre,
    apellido: m.apellido,
    actividad: m.actividad ?? '',
    modalidad: m.modalidad ?? '',
    cuota: m.cuota !== undefined ? formatArPeso(m.cuota) : '',
    instructor: m.instructor ?? ''
  };
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
};

export default function App() {
// ...
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('debtors');
  const [message, setMessage] = useState('');
  const [prepared, setPrepared] = useState<PreparedMessage[]>([]);
  const [history, setHistory] = useState<PreparedMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    const res = await fetch(`${API}/history`);
    if (!res.ok) {
      const payload = (await res.json()) as ApiError;
      throw new Error(payload.message ?? 'No se pudo cargar el historial.');
    }
    const rows = (await res.json()) as PreparedMessage[];
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
      setMembers(m as Member[]);
      setDebtors(d as Member[]);
      setTemplates(t as MessageTemplate[]);
      setSyncStatus(s as SyncStatus);
      setSummary(sum as Summary);
      setHistory((h as PreparedMessage[]).slice(0, 20));
      if (!message && t[0]) setMessage((t[0] as MessageTemplate).body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void sync();
  }, []);

  const baseRows = viewMode === 'debtors' ? debtors : members;
  const filtered = useMemo(
    () =>
      baseRows.filter(
        (d) =>
          `${d.nombre} ${d.apellido}`.toLowerCase().includes(query.toLowerCase()) &&
          (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) &&
          (activityFilter === 'ALL' || d.actividad === activityFilter)
      ),
    [baseRows, query, sheetFilter, activityFilter]
  );
  const visibleDebtors = filtered.filter((m) => m.estado === 'Adeudando');
  const allVisibleSelected = visibleDebtors.length > 0 && visibleDebtors.every((d) => selected.includes(d.id));

  const toggleAllDebtors = () =>
    setSelected(
      allVisibleSelected
        ? selected.filter((id) => !visibleDebtors.some((f) => f.id === id))
        : Array.from(new Set([...selected, ...visibleDebtors.map((f) => f.id)]))
    );

  const clearSelection = () => setSelected([]);

  const prepare = async () => {
    if (selected.length === 0) {
      setError('Seleccioná al menos un miembro Adeudando antes de preparar mensajes.');
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch(`${API}/prepare-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selected, message })
      });
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

  const updatePreparedStatus = async (historyId: number | undefined, status: MessageStatus) => {
    if (!historyId) return;
    const res = await fetch(`${API}/history/${historyId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const payload = (await res.json()) as ApiError;
      throw new Error(payload.message ?? 'No se pudo actualizar el estado.');
    }

    setPrepared(prev => prev.map((item) => item.historyId === historyId ? { ...item, status } : item));
    await loadHistory();
  };

  const openWhatsApp = async (item: PreparedMessage) => {
    window.open(item.waLink, '_blank', 'noopener,noreferrer');
    await updatePreparedStatus(item.historyId, 'opened');
  };

  const preparedCounts = prepared.reduce(
    (acc, item) => {
      const key = item.status ?? 'prepared';
      acc[key] += 1;
      return acc;
    },
    { prepared: 0, opened: 0, sent_manual: 0, skipped: 0 } as Record<MessageStatus, number>
  );

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

  return (
    <main className="container">
      <header className="app-header">
        <img src="/logo/miClub - Logo trans.png" alt="miClub" className="club-logo" />
        <div>
          <h1>miClub WhatsApp CRM</h1>
          <p>Gestión de cobranzas y mensajes por WhatsApp</p>
        </div>
      </header>
      <button className="icon-btn" onClick={sync} disabled={syncing}><Icon label="↻" />{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
      {error && <p className="error-msg">Error: {error}</p>}

      <section className="dashboard">
        <article className="card"><h4><Icon label="👥" />Total inscriptos</h4><p>{summary?.totalMembers ?? members.length}</p></article>
        <article className="card"><h4><Icon label="💳" />Total adeudando</h4><p>{summary?.totalDebtors ?? debtors.length}</p></article>
        <article className="card"><h4><Icon label="$" />Deuda estimada</h4><p>{formatArPeso(summary?.totalEstimatedDebt ?? 0)}</p></article>
        <article className="card"><h4><Icon label="🗂" />Origen de datos</h4><p>{syncMessage}</p></article>
      </section>

      <section className="filters">
        <select value={viewMode} onChange={e => { setViewMode(e.target.value as ViewMode); setSelected([]); }}>
          <option value="debtors">Solo deudores</option>
          <option value="members">Todos los inscriptos</option>
        </select>
        <input placeholder="Buscar por nombre/apellido" value={query} onChange={e => setQuery(e.target.value)} />
        <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}><option value="ALL">Todas las hojas</option>{allSheets.map(s => <option key={s}>{s}</option>)}</select>
        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="ALL">Todas las actividades</option>{allActivities.map(s => <option key={s}>{s}</option>)}</select>
      </section>

      <div className="actions-row"><p><strong>Resultados visibles:</strong> {filtered.length} · <strong>Seleccionados:</strong> {selected.length}</p>
        <button className="icon-btn" onClick={toggleAllDebtors}><Icon label="☑" />Seleccionar todos los visibles</button>
        <button className="icon-btn" onClick={clearSelection}><Icon label="⌫" />Limpiar selección</button></div>

      {filtered.length === 0 ? <p>No hay resultados con los filtros actuales.</p> : <table><thead><tr><th></th><th>Nombre</th><th>Teléfono</th><th>Actividad</th><th>Cuota</th><th>Instructor</th><th>Hoja</th><th>Estado</th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><input type="checkbox" disabled={m.estado !== 'Adeudando'} checked={selected.includes(m.id)} onChange={() => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} /></td><td>{m.nombre} {m.apellido}</td><td>{m.telefono}</td><td>{m.actividad ?? '-'}</td><td>{m.cuota ? formatArPeso(m.cuota) : '-'}</td><td>{m.instructor ?? '-'}</td><td>{m.sourceSheet}</td><td>{m.estado}</td></tr>)}</tbody></table>}

      <section className="composer"><select onChange={(e) => setMessage(e.target.value)} value={message}>{templates.map(t => <option key={t.id} value={t.body}>{t.name}</option>)}</select>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
        <h3>Vista previa</h3><pre>{preview}</pre>
        <button className="icon-btn" disabled={!canPrepare} onClick={prepare}><Icon label="✉" />{preparing ? 'Preparando...' : 'Preparar mensajes'}</button></section>

      <section>
        <h3>Mensajes preparados</h3>
        <p>
          Preparados: {preparedCounts.prepared} · Abiertos: {preparedCounts.opened} · Enviados manualmente: {preparedCounts.sent_manual} · Omitidos: {preparedCounts.skipped}
        </p>
        <button className="icon-btn" onClick={() => setPrepared([])}><Icon label="⌫" />Limpiar mensajes preparados de pantalla</button>
        {prepared.length === 0 ? <p>No hay mensajes preparados en pantalla.</p> : prepared.map(p => (
          <article key={`${p.historyId ?? p.memberId}-${p.createdAt}`}>
            <p><strong>{p.nombre ?? p.memberId}</strong> · {p.phone} · {p.actividad ?? '-'} · Estado: {p.status ?? 'prepared'}</p>
            <div className="actions-row">
              <button className="icon-btn" onClick={() => void openWhatsApp(p)}><Icon label="↗" />Abrir WhatsApp</button>
              <button className="icon-btn" onClick={() => void updatePreparedStatus(p.historyId, 'sent_manual')}><Icon label="✓" />Marcar como enviado</button>
              <button className="icon-btn" onClick={() => void updatePreparedStatus(p.historyId, 'skipped')}><Icon label="⤼" />Omitir</button>
            </div>
          </article>
        ))}
      </section>
      <section><h3>Historial (últimos 20)</h3><button className="icon-btn" onClick={() => void loadHistory()}><Icon label="◴" />Actualizar historial</button>{history.length === 0 ? <p>Sin historial todavía.</p> : history.map(h => <article key={`${h.historyId ?? h.memberId}-${h.createdAt}`}><p><strong>{new Date(h.createdAt).toLocaleString()}</strong> · {h.phone} · Estado: {h.status ?? 'prepared'}</p><p>{h.message}</p><a href={h.waLink} target="_blank" rel="noreferrer">{h.waLink}</a></article>)}</section>
    </main>
  );
}
