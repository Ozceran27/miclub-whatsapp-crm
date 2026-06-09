import { useEffect, useMemo, useState } from 'react';
import type { Member } from '@miclub/shared';
import { formatArPeso } from '../utils';
import type { ModuleId } from './ModuleNav';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

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
  totalBySheet?: Record<string, number>;
  debtorsBySheet?: Record<string, number>;
};

type HomeModuleProps = {
  onOpenModule: (moduleId: ModuleId) => void;
};

type ActivityBreakdownItem = {
  activity: string;
  count: number;
};

const ACTIVE_STATUSES = new Set(['al dia', 'nuevo inscripto', 'adeudando']);
const ABANDONED_STATUS = 'abandonado';

const AREA_CARDS: Array<{ title: string; moduleId: ModuleId; sheetKeys: string[]; description: string }> = [
  { title: 'Espacio Fitness', moduleId: 'fitness', sheetKeys: ['FITNESS', 'Espacio Fitness'], description: 'Inscriptos, cuotas, pagos y actividades.' },
  { title: 'Salón', moduleId: 'salon', sheetKeys: ['SALON', 'SALÓN', 'Salon'], description: 'Actividades, inscriptos y eventos futuros.' },
  { title: 'Aula', moduleId: 'aula', sheetKeys: ['AULA'], description: 'Talleres, cursos e ingresos asociados.' },
  { title: 'Local 1', moduleId: 'local1', sheetKeys: ['LOCAL_1', 'LOCAL 1', 'Local 1'], description: 'Movimientos, comisiones y saldos.' },
  { title: 'Cantina', moduleId: 'cantina', sheetKeys: ['CANTINA'], description: 'Ventas, liquidación y movimientos.' },
  { title: 'CRM', moduleId: 'crm', sheetKeys: ['FITNESS', 'SALON', 'AULA', 'LOCAL_1', 'CANTINA', 'ADMINISTRACION'], description: 'Cobranzas y contacto manual por WhatsApp.' }
];

const normalizeText = (value?: string) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const findSheetValue = (source: Record<string, number> | undefined, keys: string[]) => {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  const normalizedEntries = Object.entries(source).map(([key, value]) => [normalizeText(key).replace(/[ _-]/g, ''), value] as const);
  for (const key of keys) {
    const normalizedKey = normalizeText(key).replace(/[ _-]/g, '');
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) return match[1];
  }
  return undefined;
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Sin sincronización registrada';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};

const getMemberStatus = (member: Member) => normalizeText(member.estado);

const isDebtor = (member: Member) => getMemberStatus(member) === 'adeudando';

const getActivityName = (member: Member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';

const buildActivityBreakdown = (records: Member[]): ActivityBreakdownItem[] => {
  const counts = new Map<string, number>();
  records.forEach((member) => {
    const activity = getActivityName(member);
    counts.set(activity, (counts.get(activity) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([activity, count]) => ({ activity, count }))
    .sort((a, b) => b.count - a.count || a.activity.localeCompare(b.activity, 'es'));
};

export default function HomeModule({ onOpenModule }: HomeModuleProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, membersRes, debtorsRes, syncRes] = await Promise.all([
        fetch(`${API}/summary`),
        fetch(`${API}/members`),
        fetch(`${API}/debtors`),
        fetch(`${API}/sync-status`)
      ]);

      if (!summaryRes.ok || !membersRes.ok || !debtorsRes.ok || !syncRes.ok) {
        throw new Error('No se pudo cargar el inicio operativo.');
      }

      const [summaryPayload, membersPayload, debtorsPayload, syncPayload] = await Promise.all([
        summaryRes.json(),
        membersRes.json(),
        debtorsRes.json(),
        syncRes.json()
      ]);

      setSummary(summaryPayload as Summary);
      setMembers(membersPayload as Member[]);
      setDebtors(debtorsPayload as Member[]);
      setSyncStatus(syncPayload as SyncStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al cargar el inicio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHome();
  }, []);

  const syncLabel = !syncStatus
    ? 'No disponible'
    : syncStatus.error
      ? 'Con advertencias'
      : syncStatus.source === 'google_sheets'
        ? 'Google Sheets conectado'
        : 'Datos mock/locales';

  const enrollmentStats = useMemo(() => {
    const active = members.filter((member) => ACTIVE_STATUSES.has(getMemberStatus(member))).length;
    const abandoned = members.filter((member) => getMemberStatus(member) === ABANDONED_STATUS).length;

    return {
      total: summary?.totalMembers ?? members.length,
      active,
      abandoned
    };
  }, [members, summary?.totalMembers]);

  const debtorRecords = useMemo(() => {
    if (debtors.length > 0) return debtors;
    return members.filter(isDebtor);
  }, [debtors, members]);

  const debtorBreakdown = useMemo(() => buildActivityBreakdown(debtorRecords), [debtorRecords]);
  const mainDebtorBreakdown = debtorBreakdown.slice(0, 4);
  const remainingDebtorActivities = Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0);

  const activeActivities = useMemo(() => {
    const activities = new Set(
      members
        .filter((member) => ACTIVE_STATUSES.has(getMemberStatus(member)))
        .map(getActivityName)
        .filter((activity) => activity !== 'Sin actividad asignada')
    );

    return activities.size;
  }, [members]);

  const areaCards = useMemo(() => AREA_CARDS.map((area) => ({
    ...area,
    membersCount: area.moduleId === 'crm'
      ? (summary?.totalMembers ?? members.length)
      : findSheetValue(summary?.totalBySheet, area.sheetKeys),
    debtorsCount: area.moduleId === 'crm'
      ? (summary?.totalDebtors ?? debtors.length)
      : findSheetValue(summary?.debtorsBySheet, area.sheetKeys)
  })), [summary, members.length, debtors.length]);

  const estimatedDebt = summary?.totalEstimatedDebt;
  const hasEstimatedDebt = typeof estimatedDebt === 'number' && estimatedDebt > 0;

  return (
    <main className="module-content">
      <section className="module-hero home-hero">
        <div>
          <p className="eyebrow">Inicio</p>
          <h2>Panel operativo de miClub</h2>
          <p>Resumen ejecutivo con indicadores generales, sincronización y datos reales disponibles por sector.</p>
        </div>
      </section>

      {error && <p className="error-msg">Error: {error}</p>}
      {loading && <p className="section-note">Cargando métricas del club...</p>}

      <section className="dashboard home-dashboard">
        <article className="card home-kpi-card">
          <h4>👥 Total de inscriptos</h4>
          <p>{enrollmentStats.total}</p>
          <div className="metric-list metric-list--compact">
            <span><strong>Activos</strong>{enrollmentStats.active}</span>
            <span><strong>Abandonados</strong>{enrollmentStats.abandoned}</span>
          </div>
        </article>

        <article className="card home-kpi-card">
          <h4>💳 Adeudando</h4>
          <p>{summary?.totalDebtors ?? debtorRecords.length}</p>
          <div className="metric-list">
            {mainDebtorBreakdown.length > 0 ? mainDebtorBreakdown.map((item) => (
              <span key={item.activity}><strong>{item.activity}</strong>{item.count}</span>
            )) : <span><strong>Sin deudores registrados</strong>0</span>}
            {remainingDebtorActivities > 0 && <small>+ {remainingDebtorActivities} actividades</small>}
          </div>
        </article>

        <article className="card home-kpi-card">
          <h4>🏦 Saldos operativos</h4>
          <div className="finance-lines">
            <span><strong>Saldo adeudado</strong>{hasEstimatedDebt ? formatArPeso(estimatedDebt) : '—'}</span>
            <span><strong>Movimientos pendientes</strong>—</span>
            <span><strong>Saldo total</strong>—</span>
          </div>
          <small className="integration-note">Se integrará desde la hoja ADMINISTRACIÓN.</small>
        </article>

        <article className="card home-kpi-card">
          <h4>📊 Resumen financiero</h4>
          <div className="finance-lines">
            <span><strong>Caja</strong>—</span>
            <span><strong>Bancos</strong>—</span>
            <span><strong>Saldo proyectado</strong>—</span>
            <span><strong>Pendientes</strong>—</span>
          </div>
          <small className="integration-note">Pendiente de integración con ADMINISTRACIÓN.</small>
        </article>

        <article className="card home-kpi-card"><h4>🔄 Estado de sincronización</h4><p>{syncLabel}</p></article>
        <article className="card home-kpi-card"><h4>🕒 Última sincronización</h4><p>{formatDateTime(syncStatus?.lastSyncAt)}</p></article>
        <article className="card home-kpi-card"><h4>🏷️ Actividades activas detectadas</h4><p>{activeActivities}</p></article>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Distribución operativa por sector</h3>
            <p>Inscriptos y deudores detectados desde las hojas disponibles.</p>
          </div>
          <button className="icon-btn ghost-btn" onClick={() => void loadHome()}>Actualizar inicio</button>
        </div>
        <div className="area-grid">
          {areaCards.map((area) => {
            const hasData = area.membersCount !== undefined || area.debtorsCount !== undefined;
            return (
              <article key={area.moduleId} className="area-card">
                <div>
                  <h4>{area.title}</h4>
                  <p>{area.description}</p>
                </div>
                {hasData ? (
                  <div className="area-card__metrics">
                    <span><strong>{area.membersCount ?? 0}</strong> inscriptos</span>
                    <span><strong>{area.debtorsCount ?? 0}</strong> deudores</span>
                  </div>
                ) : (
                  <p className="muted">Sin datos disponibles todavía</p>
                )}
                <button className="icon-btn ghost-btn" onClick={() => onOpenModule(area.moduleId)}>Ver módulo</button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
