import { useEffect, useMemo, useState } from 'react';
import type { ContactedRecentResponse, Member, MessageTemplate, PaginatedHistoryResponse, PreparedMessage, PrepareMessagesValidation } from '@miclub/shared';
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
  debtorsWithoutPayments?: number;
};
type ViewMode = 'debtors' | 'members';

type SortDirection = 'asc' | 'desc';
type SortBy = 'nombre' | 'apellido' | 'actividad' | 'sourceSheet' | 'estado' | 'cuota' | 'lastPaymentAt' | 'lastContactAt' | 'contactedRecently';
type SortValue = string | number | boolean | undefined | null;

const DEFAULT_SORT_BY: SortBy = 'lastPaymentAt';
const DEFAULT_SORT_DIRECTION: SortDirection = 'asc';

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
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

const SORT_LABEL_BY_VALUE = SORT_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<SortBy, string>
);

const isEmptySortValue = (value: SortValue) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const compareText = (a: SortValue, b: SortValue) => {
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  return String(a).localeCompare(String(b), 'es-AR', { sensitivity: 'base' });
};

const compareNumber = (a: SortValue, b: SortValue) => {
  const aNumber = typeof a === 'number' ? a : Number(a);
  const bNumber = typeof b === 'number' ? b : Number(b);
  const aEmpty = isEmptySortValue(a) || Number.isNaN(aNumber);
  const bEmpty = isEmptySortValue(b) || Number.isNaN(bNumber);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  return aNumber - bNumber;
};

const compareDate = (a: SortValue, b: SortValue) => {
  const aTime = typeof a === 'string' || typeof a === 'number' ? Date.parse(String(a)) : NaN;
  const bTime = typeof b === 'string' || typeof b === 'number' ? Date.parse(String(b)) : NaN;
  const aEmpty = isEmptySortValue(a) || Number.isNaN(aTime);
  const bEmpty = isEmptySortValue(b) || Number.isNaN(bTime);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  return aTime - bTime;
};

const getSortValue = (member: Member, sortBy: SortBy, recentContact?: ContactedRecentResponse['byMemberId'][string]): SortValue => {
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

const compareMembers = (
  a: Member,
  b: Member,
  sortBy: SortBy,
  sortDirection: SortDirection,
  contactedByMemberId: ContactedRecentResponse['byMemberId']
) => {
  const aValue = getSortValue(a, sortBy, contactedByMemberId[a.id]);
  const bValue = getSortValue(b, sortBy, contactedByMemberId[b.id]);
  const baseComparison =
    sortBy === 'cuota' || sortBy === 'contactedRecently'
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

  if (aEmpty || bEmpty) return baseComparison;
  return sortDirection === 'asc' ? baseComparison : -baseComparison;
};
type MessageStatus = 'prepared' | 'opened' | 'sent_manual' | 'skipped';
const ACTIONABLE_STATUSES: MessageStatus[] = ['prepared', 'opened'];

const STATUS_META: Record<MessageStatus, { label: string; icon: string; className: string }> = {
  prepared: { label: 'Pendiente', icon: '🕒', className: 'status-chip--prepared' },
  opened: { label: 'Abierto', icon: '👁', className: 'status-chip--opened' },
  sent_manual: { label: 'Enviado manualmente', icon: '✓', className: 'status-chip--sent' },
  skipped: { label: 'Omitido', icon: '✕', className: 'status-chip--skipped' }
};

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

const getStatusLabel = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].label;
const getStatusIcon = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].icon;
const getStatusClass = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].className;
const formatDateTime = (value?: string) => {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
const formatPaymentDate = (value?: string) => {
  if (!value) return 'Sin pagos registrados';
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const formatLastPayment = (member: Member) => {
  if (!member.lastPaymentAt) return 'Sin pagos registrados';
  const amount = member.lastPaymentAmount !== undefined ? ` · ${formatArPeso(member.lastPaymentAmount)}` : '';
  return `${formatPaymentDate(member.lastPaymentAt)}${amount}`;
};
const summarizeMessage = (message: string, max = 120) =>
  message.length > max ? `${message.slice(0, max).trimEnd()}…` : message;

export default function App() {
// ...
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT_BY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const [viewMode, setViewMode] = useState<ViewMode>('debtors');
  const [message, setMessage] = useState('');
  const [prepared, setPrepared] = useState<PreparedMessage[]>([]);
  const [history, setHistory] = useState<PreparedMessage[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState({ pageSize: 20, total: 0, totalPages: 0 });
  const [contactedRecent, setContactedRecent] = useState<ContactedRecentResponse>({ windowDays: 30, since: new Date(0).toISOString(), memberIds: [], byMemberId: {} });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateStatus, setTemplateStatus] = useState<'idle' | 'dirty' | 'saved'>('idle');

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  const loadHistory = async (page = 1) => {
    const res = await fetch(`${API}/history?page=${page}&pageSize=20`);
    if (!res.ok) {
      const payload = (await res.json()) as ApiError;
      throw new Error(payload.message ?? 'No se pudo cargar el historial.');
    }
    const payload = (await res.json()) as PaginatedHistoryResponse;
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
      setMembers(m as Member[]);
      setDebtors(d as Member[]);
      setTemplates(t as MessageTemplate[]);
      setSyncStatus(s as SyncStatus);
      setSummary(sum as Summary);
      const historyPayload = h as PaginatedHistoryResponse;
      setHistory(historyPayload.items);
      setHistoryPage(historyPayload.page);
      setHistoryMeta({ pageSize: historyPayload.pageSize, total: historyPayload.total, totalPages: historyPayload.totalPages });
      setContactedRecent(c as ContactedRecentResponse);
      const firstTemplate = (t as MessageTemplate[])[0];
      if (firstTemplate) {
        setSelectedTemplateId((prev) => prev || firstTemplate.id);
        if (!selectedTemplateId) {
          setTemplateName(firstTemplate.name);
          setMessage(firstTemplate.body);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void sync();
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateName(selectedTemplate.name);
    setMessage(selectedTemplate.body);
    setTemplateStatus('idle');
  }, [selectedTemplateId, selectedTemplate?.updatedAt]);

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    const res = await fetch(`${API}/templates/${selectedTemplate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, body: message })
    });
    if (!res.ok) {
      const payload = (await res.json()) as ApiError;
      throw new Error(payload.message ?? 'No se pudo guardar la plantilla.');
    }
    const updated = (await res.json()) as MessageTemplate;
    setTemplates((prev) => prev.map((template) => (template.id === updated.id ? updated : template)));
    setTemplateStatus('saved');
  };

  const handleTemplateChange = (nextId: string) => {
    if (templateStatus === 'dirty' && !window.confirm('Tenés cambios sin guardar. ¿Deseás descartarlos?')) return;
    setSelectedTemplateId(nextId);
  };

  const createTemplate = async () => {
    const name = window.prompt('Nombre de la nueva plantilla:');
    if (!name?.trim()) return;
    const res = await fetch(`${API}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), body: message || 'Hola {nombre}, ' })
    });
    if (!res.ok) {
      const payload = (await res.json()) as ApiError;
      throw new Error(payload.message ?? 'No se pudo crear la plantilla.');
    }
    const created = (await res.json()) as MessageTemplate;
    setTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateStatus('saved');
  };

  const duplicateTemplate = async () => {
    if (!selectedTemplate) return;
    const res = await fetch(`${API}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${templateName} (copia)`, body: message })
    });
    if (!res.ok) throw new Error('No se pudo duplicar la plantilla.');
    const duplicated = (await res.json()) as MessageTemplate;
    setTemplates((prev) => [...prev, duplicated]);
    setSelectedTemplateId(duplicated.id);
    setTemplateStatus('saved');
  };

  const deleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.isDefault) return;
    if (!window.confirm('¿Eliminar plantilla seleccionada?')) return;
    const res = await fetch(`${API}/templates/${selectedTemplate.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la plantilla.');
    const remaining = templates.filter((template) => template.id !== selectedTemplate.id);
    setTemplates(remaining);
    if (remaining[0]) setSelectedTemplateId(remaining[0].id);
  };

  const resetDefaultTemplates = async () => {
    if (!window.confirm('Esto restaurará las plantillas predeterminadas y quitará las personalizadas.')) return;
    const res = await fetch(`${API}/templates/reset-defaults`, { method: 'POST' });
    if (!res.ok) throw new Error('No se pudieron restaurar plantillas.');
    const restored = (await res.json()) as MessageTemplate[];
    setTemplates(restored);
    if (restored[0]) setSelectedTemplateId(restored[0].id);
    setTemplateStatus('saved');
  };

  const baseRows = viewMode === 'debtors' ? debtors : members;
  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const filteredRows = baseRows.filter(
      (d) =>
        `${d.nombre} ${d.apellido}`.toLowerCase().includes(normalizedQuery) &&
        (sheetFilter === 'ALL' || d.sourceSheet === sheetFilter) &&
        (activityFilter === 'ALL' || d.actividad === activityFilter)
    );

    return [...filteredRows].sort((a, b) => compareMembers(a, b, sortBy, sortDirection, contactedRecent.byMemberId));
  }, [baseRows, query, sheetFilter, activityFilter, sortBy, sortDirection, contactedRecent.byMemberId]);

  const changeSort = (nextSortBy: SortBy) => {
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

  const renderSortIndicator = (columnSortBy: SortBy) => (sortBy === columnSortBy ? (sortDirection === 'asc' ? '↑' : '↓') : '');
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
      const validationRes = await fetch(`${API}/prepare-messages/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selected, message, templateName: selectedTemplate?.name ?? templateName })
      });
      if (!validationRes.ok) {
        const payload = (await validationRes.json()) as ApiError;
        throw new Error(payload.message ?? 'No se pudo validar la preparación de mensajes.');
      }
      const validation = (await validationRes.json()) as PrepareMessagesValidation;
      if (validation.missingPhoneMembers.length > 0) {
        throw new Error(`Hay ${validation.missingPhoneMembers.length} miembros sin teléfono válido.`);
      }
      if (validation.unresolvedVariables.length > 0) {
        throw new Error(`Hay variables sin reemplazar en el mensaje: ${validation.unresolvedVariables.join(', ')}`);
      }
      const previewClients = validation.selectedPreview.map((c) => c.nombre).join(', ');
      const duplicateWarning = validation.duplicates.length > 0 ? `\nAviso: ${validation.duplicates.length} clientes tienen mensajes recientes.` : '';
      const batchWarning = validation.selectedCount > 1 ? `\n⚠ Vas a preparar ${validation.selectedCount} mensajes. Revisá antes de abrir WhatsApp.` : '';
      const confirmText = `Confirmar preparación\nCantidad: ${validation.selectedCount}\nPrimeros clientes: ${previewClients}\nActividad: ${validation.selectedPreview[0]?.actividad ?? '-'}\nCuota: ${validation.selectedPreview[0]?.cuota ?? '-'}\nMensaje ejemplo: ${validation.sampleMessage}${duplicateWarning}${batchWarning}`;
      if (!window.confirm(confirmText)) return;

      const res = await fetch(`${API}/prepare-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selected, message, templateName: selectedTemplate?.name ?? templateName })
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

    setPrepared(prev =>
      prev
        .map((item) => (item.historyId === historyId ? { ...item, status } : item))
        .filter((item) => ACTIONABLE_STATUSES.includes(item.status ?? 'prepared'))
    );
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
  const actionablePrepared = prepared.filter((item) =>
    ACTIONABLE_STATUSES.includes(item.status ?? 'prepared')
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
        <article className="card"><h4><Icon label="🧾" />Deudores sin pagos registrados</h4><p>{summary?.debtorsWithoutPayments ?? debtors.filter((d) => !d.lastPaymentAt).length}</p></article>
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

      <section className="sort-controls" aria-label="Controles de ordenamiento">
        <label>
          Ordenar por
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Dirección
          <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as SortDirection)}>
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </select>
        </label>
        <button className="icon-btn ghost-btn" onClick={resetSort}><Icon label="↺" />Restablecer orden</button>
        <p className="sort-summary">Ordenando por: {SORT_LABEL_BY_VALUE[sortBy]} · {sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}</p>
      </section>

      <div className="actions-row"><p><strong>Resultados visibles:</strong> {filtered.length} · <strong>Seleccionados:</strong> {selected.length} · <strong>Contactados últimos 30 días:</strong> {contactedRecent.memberIds.length}</p>
        <button className="icon-btn" onClick={toggleAllDebtors}><Icon label="☑" />Seleccionar todos los visibles</button>
        <button className="icon-btn" onClick={clearSelection}><Icon label="⌫" />Limpiar selección</button></div>

      {filtered.length === 0 ? <p>No hay resultados con los filtros actuales.</p> : <div className="members-table-wrap"><table className="members-table"><thead><tr><th></th><th><button className="sortable-header" onClick={() => changeSort('nombre')}>Nombre {renderSortIndicator('nombre')}</button></th><th>Teléfono</th><th><button className="sortable-header" onClick={() => changeSort('actividad')}>Actividad {renderSortIndicator('actividad')}</button></th><th><button className="sortable-header" onClick={() => changeSort('cuota')}>Cuota {renderSortIndicator('cuota')}</button></th><th><button className="sortable-header" onClick={() => changeSort('lastPaymentAt')}>Último pago {renderSortIndicator('lastPaymentAt')}</button></th><th>Instructor</th><th><button className="sortable-header" onClick={() => changeSort('sourceSheet')}>Hoja {renderSortIndicator('sourceSheet')}</button></th><th><button className="sortable-header" onClick={() => changeSort('estado')}>Estado {renderSortIndicator('estado')}</button></th><th><button className="sortable-header" onClick={() => changeSort('lastContactAt')}>Contacto {renderSortIndicator('lastContactAt')}</button></th></tr></thead><tbody>{filtered.map(m => { const recent = contactedRecent.byMemberId[m.id]; return <tr key={m.id} className={recent ? 'recent-contact-row' : ''}><td><input type="checkbox" disabled={m.estado !== 'Adeudando'} checked={selected.includes(m.id)} onChange={() => setSelected(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} /></td><td>{m.nombre} {m.apellido}</td><td>{m.telefono}</td><td>{m.actividad ?? '-'}</td><td>{m.cuota !== undefined ? formatArPeso(m.cuota) : '-'}</td><td><span className={m.lastPaymentAt ? 'last-payment-badge' : 'last-payment-badge last-payment-badge--empty'} title={m.lastPaymentConcept ? `Concepto: ${m.lastPaymentConcept}` : undefined}>{formatLastPayment(m)}</span></td><td>{m.instructor ?? '-'}</td><td>{m.sourceSheet}</td><td>{m.estado}</td><td>{recent ? <span className="recent-contact-badge" title="Mensaje enviado en los últimos 30 días">📩 Contactado: {new Date(recent.lastSentAt).toLocaleDateString('es-AR')}</span> : '-'}</td></tr>; })}</tbody></table></div>}

      <section className="composer"><select onChange={(e) => handleTemplateChange(e.target.value)} value={selectedTemplateId}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input value={templateName} onChange={(e) => { setTemplateName(e.target.value); setTemplateStatus('dirty'); }} placeholder="Nombre de plantilla" />
        <textarea value={message} onChange={e => { setMessage(e.target.value); setTemplateStatus('dirty'); }} rows={5} />
        <p><strong>Estado:</strong> {templateStatus === 'dirty' ? 'Cambios sin guardar' : templateStatus === 'saved' ? 'Plantilla guardada' : 'Sin cambios'}</p>
        <div className="actions-row">
          <button className="icon-btn" onClick={() => void saveTemplate()} disabled={!selectedTemplate || templateStatus !== 'dirty'}><Icon label="💾" />Guardar cambios</button>
          <button className="icon-btn" onClick={() => void createTemplate()}><Icon label="＋" />Crear plantilla</button>
          <button className="icon-btn" onClick={() => void duplicateTemplate()} disabled={!selectedTemplate}><Icon label="⧉" />Duplicar plantilla</button>
          {!selectedTemplate?.isDefault && <button className="icon-btn" onClick={() => void deleteTemplate()}><Icon label="🗑" />Eliminar plantilla</button>}
          <button className="icon-btn ghost-btn" onClick={() => void resetDefaultTemplates()}><Icon label="↺" />Restaurar plantillas predeterminadas</button>
        </div>
        <h3>Vista previa</h3><pre>{preview}</pre>
        <button className="icon-btn" disabled={!canPrepare} onClick={prepare}><Icon label="✉" />{preparing ? 'Preparando...' : 'Preparar mensajes'}</button></section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Mensajes preparados</h3>
            <p>Gestioná los mensajes listos para enviar y movelos al historial cuando finalices.</p>
          </div>
          <button className="icon-btn ghost-btn" onClick={() => setPrepared([])}><Icon label="⌫" />Limpiar mensajes preparados de pantalla</button>
        </div>
        <p className="section-note">Esta acción solo limpia la pantalla actual y no borra historial.</p>
        <div className="count-chips">
          <span className="status-chip status-chip--prepared">Pendientes: {preparedCounts.prepared}</span>
          <span className="status-chip status-chip--opened">Abiertos: {preparedCounts.opened}</span>
          <span className="status-chip status-chip--sent">Enviados: {preparedCounts.sent_manual}</span>
          <span className="status-chip status-chip--skipped">Omitidos: {preparedCounts.skipped}</span>
        </div>
        {actionablePrepared.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p className="empty-state-title">No hay mensajes pendientes</p>
            <p>Prepará mensajes desde la lista de deudores para gestionarlos acá.</p>
          </div>
        ) : (
          <div className="prepared-grid">
            {actionablePrepared.map((p) => (
              <article key={`${p.historyId ?? p.memberId}-${p.createdAt}`} className="prepared-card">
                <div className="prepared-header">
                  <h4>{p.nombre ?? p.memberId}</h4>
                  <span className={`status-chip ${getStatusClass(p.status)}`}><Icon label={getStatusIcon(p.status)} />{getStatusLabel(p.status)}</span>
                </div>
                <p className="prepared-meta"><strong>Teléfono destino:</strong> {p.phone}</p>
                <p className="prepared-meta"><strong>Actividad:</strong> {p.actividad ?? '-'}</p>
                <div className="actions-row prepared-actions">
                  <button className="icon-btn" onClick={() => void openWhatsApp(p)}><Icon label="↗" />Abrir WhatsApp</button>
                  <button className="icon-btn" onClick={() => void updatePreparedStatus(p.historyId, 'sent_manual')}><Icon label="✓" />Marcar enviado</button>
                  <button className="icon-btn" onClick={() => void updatePreparedStatus(p.historyId, 'skipped')}><Icon label="✕" />Omitir</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Historial</h3>
            <p>Últimos 200 movimientos (20 por página)</p>
          </div>
          <button className="icon-btn ghost-btn" onClick={() => void loadHistory()}><Icon label="◴" />Actualizar historial</button>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂</div>
            <p className="empty-state-title">Aún no hay movimientos</p>
            <p>Cuando prepares o gestiones mensajes, aparecerán en este historial.</p>
          </div>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr><th>Estado</th><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Mensaje</th><th>Actividad</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.historyId ?? h.memberId}-${h.createdAt}`}>
                    <td><span className={`status-chip ${getStatusClass(h.status)}`}><Icon label={getStatusIcon(h.status)} />{getStatusLabel(h.status)}</span></td>
                    <td>{formatDateTime(h.createdAt)}</td>
                    <td>{h.nombre ?? h.memberId}</td>
                    <td>{h.phone}</td>
                    <td>
                      <div className="history-message-card">
                        <p className="history-message-preview">{h.templateName?.trim() || 'Recordatorio amable'}</p>
                      </div>
                    </td>
                    <td>{h.actividad ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="history-pagination">
          <button className="icon-btn ghost-btn" disabled={historyPage <= 1} onClick={() => void loadHistory(historyPage - 1)}>Anterior</button>
          <span>Página {historyMeta.totalPages === 0 ? 0 : historyPage} de {historyMeta.totalPages}</span>
          <button className="icon-btn ghost-btn" disabled={historyPage >= historyMeta.totalPages} onClick={() => void loadHistory(historyPage + 1)}>Siguiente</button>
        </div>
      </section>
    </main>
  );
}
