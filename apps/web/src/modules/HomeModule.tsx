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

type StatusBreakdown = {
  total: number;
  active: number;
  current: number;
  newEnrollment: number;
  debtor: number;
  abandoned: number;
};

const STATUS_ALIASES: Record<string, 'current' | 'newEnrollment' | 'debtor' | 'abandoned'> = {
  'al dia': 'current',
  aldia: 'current',
  activo: 'current',
  activos: 'current',
  'nuevo inscripto': 'newEnrollment',
  nuevoinscripto: 'newEnrollment',
  'nuevo inscrito': 'newEnrollment',
  nuevoinscrito: 'newEnrollment',
  nuevo: 'newEnrollment',
  adeudando: 'debtor',
  deudor: 'debtor',
  deudores: 'debtor',
  deuda: 'debtor',
  abandonado: 'abandoned',
  abandonada: 'abandoned',
  abandono: 'abandoned',
  inactivo: 'abandoned',
  inactivos: 'abandoned'
};

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

const normalizeStatus = (status?: string) => {
  const normalized = normalizeText(status);
  const compact = normalized.replace(/[ _-]/g, '');
  return STATUS_ALIASES[normalized] ? normalized : compact;
};

const getMemberStatus = (member: Member) => normalizeStatus(String(member.estado ?? ''));

const getStatusBucket = (member: Member) => STATUS_ALIASES[getMemberStatus(member)];

const isActiveMember = (member: Member) => {
  const bucket = getStatusBucket(member);
  return bucket === 'current' || bucket === 'newEnrollment' || bucket === 'debtor';
};

const isDebtor = (member: Member) => getStatusBucket(member) === 'debtor';

const getActivityName = (member: Member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';

const buildStatusBreakdown = (records: Member[], fallbackTotal?: number): StatusBreakdown => {
  const breakdown: StatusBreakdown = {
    total: records.length || fallbackTotal || 0,
    active: 0,
    current: 0,
    newEnrollment: 0,
    debtor: 0,
    abandoned: 0
  };

  records.forEach((member) => {
    const bucket = getStatusBucket(member);
    if (bucket === 'current') breakdown.current += 1;
    if (bucket === 'newEnrollment') breakdown.newEnrollment += 1;
    if (bucket === 'debtor') breakdown.debtor += 1;
    if (bucket === 'abandoned') breakdown.abandoned += 1;
  });

  breakdown.active = breakdown.current + breakdown.newEnrollment + breakdown.debtor;
  return breakdown;
};

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

const buildActiveActivityBreakdown = (records: Member[]) => buildActivityBreakdown(records.filter(isActiveMember));

const buildDebtorActivityBreakdown = (records: Member[]) => buildActivityBreakdown(records.filter(isDebtor));

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

  const enrollmentStats = useMemo(
    () => buildStatusBreakdown(members, summary?.totalMembers),
    [members, summary?.totalMembers]
  );

  const debtorRecords = useMemo(() => {
    if (members.length > 0) return members;
    return debtors;
  }, [debtors, members]);

  const debtorBreakdown = useMemo(() => buildDebtorActivityBreakdown(debtorRecords), [debtorRecords]);
  const mainDebtorBreakdown = debtorBreakdown.slice(0, 5);
  const remainingDebtorActivities = Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0);
  const totalDebtors = debtorBreakdown.reduce((total, item) => total + item.count, 0);
  const maxDebtorActivityCount = mainDebtorBreakdown[0]?.count ?? 0;

  const activeActivityBreakdown = useMemo(() => buildActiveActivityBreakdown(members), [members]);
  const mainActiveActivityBreakdown = activeActivityBreakdown.slice(0, 5);
  const remainingActiveActivities = Math.max(activeActivityBreakdown.length - mainActiveActivityBreakdown.length, 0);
  const maxActiveActivityCount = mainActiveActivityBreakdown[0]?.count ?? 0;

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

      <section className="home-dashboard-stack" aria-label="Resumen operativo del club">
        <div className="home-dashboard-row home-dashboard-row--primary">
          <article className="card home-kpi-card home-kpi-card--enrollment">
            <div className="home-card-heading">
              <h4>👥 Total de inscriptos</h4>
              <p>Estados operativos actuales</p>
            </div>
            <p className="home-kpi-value">{enrollmentStats.total}</p>
            <div className="status-breakdown-grid">
              <span><strong>Activos</strong>{enrollmentStats.active}</span>
              <span><strong>Al día</strong>{enrollmentStats.current}</span>
              <span><strong>Nuevos inscriptos</strong>{enrollmentStats.newEnrollment}</span>
              <span><strong>Adeudando</strong>{enrollmentStats.debtor}</span>
              <span><strong>Abandonados</strong>{enrollmentStats.abandoned}</span>
            </div>
          </article>

          <article className="card home-kpi-card">
            <div className="home-card-heading">
              <h4>💳 Adeudando</h4>
              <p>Deudores por actividad</p>
            </div>
            <p className="home-kpi-value">{totalDebtors}</p>
            <div className="activity-breakdown-list">
              {mainDebtorBreakdown.length > 0 ? mainDebtorBreakdown.map((item) => (
                <div className="activity-breakdown-item" key={item.activity}>
                  <div className="activity-breakdown-row">
                    <span>{item.activity}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div className="activity-breakdown-track" aria-hidden="true">
                    <span style={{ width: `${Math.max((item.count / maxDebtorActivityCount) * 100, 8)}%` }} />
                  </div>
                </div>
              )) : <p className="empty-card-note">Sin deudores registrados</p>}
              {remainingDebtorActivities > 0 && <small>+ {remainingDebtorActivities} actividades</small>}
            </div>
          </article>

          <article className="card home-kpi-card">
            <div className="home-card-heading">
              <h4>🏷️ Inscriptos por actividad</h4>
              <p>Solo inscriptos activos</p>
            </div>
            <div className="activity-breakdown-list activity-breakdown-list--featured">
              {mainActiveActivityBreakdown.length > 0 ? mainActiveActivityBreakdown.map((item) => (
                <div className="activity-breakdown-item" key={item.activity}>
                  <div className="activity-breakdown-row">
                    <span>{item.activity}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div className="activity-breakdown-track" aria-hidden="true">
                    <span style={{ width: `${Math.max((item.count / maxActiveActivityCount) * 100, 8)}%` }} />
                  </div>
                </div>
              )) : <p className="empty-card-note">Sin actividades activas registradas</p>}
              {remainingActiveActivities > 0 && <small>+ {remainingActiveActivities} actividades</small>}
            </div>
          </article>
        </div>

        <div className="home-dashboard-row home-dashboard-row--secondary">
          <article className="card home-kpi-card home-kpi-card--compact">
            <div className="home-card-heading">
              <h4>🔄 Estado de sincronización</h4>
              <p>Origen de datos</p>
            </div>
            <p className="home-secondary-value">{syncLabel}</p>
            {syncStatus?.error && <small className="integration-note">{syncStatus.error}</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact">
            <div className="home-card-heading">
              <h4>🕒 Última sincronización</h4>
              <p>Actualización registrada</p>
            </div>
            <p className="home-secondary-value">{formatDateTime(syncStatus?.lastSyncAt)}</p>
          </article>

          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>🏦 Saldos operativos</h4>
              <p>Estructura futura</p>
            </div>
            <div className="finance-lines finance-lines--compact">
              <span><strong>Saldo adeudado</strong>{hasEstimatedDebt ? formatArPeso(estimatedDebt) : '—'}</span>
              <span><strong>Movimientos pendientes</strong>—</span>
            </div>
            <small className="integration-note">Pendiente de integración con ADMINISTRACIÓN.</small>
          </article>

          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>📊 Resumen financiero</h4>
              <p>Estructura futura</p>
            </div>
            <div className="finance-lines finance-lines--compact">
              <span><strong>Caja / bancos</strong>—</span>
              <span><strong>Saldo proyectado</strong>—</span>
            </div>
            <small className="integration-note">Pendiente de integración con ADMINISTRACIÓN.</small>
          </article>
        </div>
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
