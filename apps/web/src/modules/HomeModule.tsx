import { useEffect, useMemo, useState } from 'react';
import type { ClubOperationsSummary, Member, StatusBreakdown as ApiStatusBreakdown } from '@miclub/shared';
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
  statusBreakdown?: ApiStatusBreakdown;
  rawStatusBreakdown?: Record<string, number>;
};

type HomeModuleProps = {
  onOpenModule: (moduleId: ModuleId) => void;
};

type ActivityBreakdownItem = {
  activity: string;
  count: number;
};

type FinancialLine = {
  id?: string;
  label: string;
  value: string;
};

type StatusBreakdown = {
  total: number;
  active: number;
  current: number;
  newEnrollment: number;
  debtor: number;
  abandoned: number;
  others: number;
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

const normalizeStatus = (status?: string) => normalizeText(status)
  .replace(/[-–—_/]+/g, ' ')
  .replace(/[^a-z0-9ñ\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const getStatusBucketFromRawStatus = (status?: string) => {
  const normalized = normalizeStatus(status);
  const compact = normalized.replace(/\s/g, '');

  if (STATUS_ALIASES[normalized]) return STATUS_ALIASES[normalized];
  if (STATUS_ALIASES[compact]) return STATUS_ALIASES[compact];
  if (normalized.includes('nuevo') && (normalized.includes('inscripto') || normalized.includes('inscrito'))) return 'newEnrollment';
  if (normalized.includes('abandon')) return 'abandoned';
  if (normalized.includes('adeud') || normalized.includes('deud')) return 'debtor';
  if (normalized.includes('al dia') || compact.includes('aldia')) return 'current';

  return undefined;
};

const getMemberStatus = (member: Member) => normalizeStatus(String(member.estado ?? ''));

const getStatusBucket = (member: Member) => getStatusBucketFromRawStatus(getMemberStatus(member));

const isActiveMember = (member: Member) => getStatusBucket(member) !== 'abandoned';

const isDebtor = (member: Member) => getStatusBucket(member) === 'debtor';

const getActivityName = (member: Member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';

const getEnrollmentStatusBreakdown = (records: Member[], fallbackTotal?: number): StatusBreakdown => {
  const breakdown: StatusBreakdown = {
    total: records.length || fallbackTotal || 0,
    active: 0,
    current: 0,
    newEnrollment: 0,
    debtor: 0,
    abandoned: 0,
    others: 0
  };

  records.forEach((member) => {
    const bucket = getStatusBucket(member);
    if (bucket === 'current') breakdown.current += 1;
    if (bucket === 'newEnrollment') breakdown.newEnrollment += 1;
    if (bucket === 'debtor') breakdown.debtor += 1;
    if (bucket === 'abandoned') breakdown.abandoned += 1;
    if (!bucket) breakdown.others += 1;
  });

  breakdown.active = breakdown.total - breakdown.abandoned;
  return breakdown;
};

const mapSummaryStatusBreakdown = (statusBreakdown?: ApiStatusBreakdown): StatusBreakdown | undefined => {
  if (!statusBreakdown) return undefined;
  return {
    total: statusBreakdown.total,
    active: statusBreakdown.active,
    current: statusBreakdown.alDia,
    newEnrollment: statusBreakdown.nuevoInscripto,
    debtor: statusBreakdown.adeudando,
    abandoned: statusBreakdown.abandonado,
    others: statusBreakdown.otros
  };
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

const renderActivityBreakdown = (items: ActivityBreakdownItem[], maxCount: number, emptyLabel: string) => (
  items.length > 0 ? items.map((item) => (
    <div className="activity-breakdown-item" key={item.activity}>
      <div className="activity-breakdown-row">
        <span>{item.activity}</span>
        <strong>{item.count}</strong>
      </div>
      <div className="activity-breakdown-track" aria-hidden="true">
        <span style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }} />
      </div>
    </div>
  )) : <p className="empty-card-note">{emptyLabel}</p>
);

const renderFinanceLines = (lines: FinancialLine[]) => (
  <div className="finance-lines finance-lines--compact">
    {lines.map((line) => (
      <span key={line.id ?? line.label}><strong>{line.label}</strong>{line.value}</span>
    ))}
  </div>
);

export default function HomeModule({ onOpenModule }: HomeModuleProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [financeSummary, setFinanceSummary] = useState<ClubOperationsSummary | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = async () => {
    setLoading(true);
    setError(null);
    setFinanceError(null);
    try {
      const financePromise = fetch(`${API}/club-finance-summary`)
        .then(async (response) => {
          if (!response.ok) throw new Error('No se pudo cargar el resumen financiero.');
          return response.json() as Promise<ClubOperationsSummary>;
        })
        .catch((financeLoadError) => {
          setFinanceError(financeLoadError instanceof Error ? financeLoadError.message : 'Resumen financiero no disponible.');
          return null;
        });

      const [summaryRes, membersRes, debtorsRes, syncRes, financePayload] = await Promise.all([
        fetch(`${API}/summary`),
        fetch(`${API}/members`),
        fetch(`${API}/debtors`),
        fetch(`${API}/sync-status`),
        financePromise
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
      setFinanceSummary(financePayload);
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
    () => mapSummaryStatusBreakdown(summary?.statusBreakdown) ?? getEnrollmentStatusBreakdown(members, summary?.totalMembers),
    [members, summary?.statusBreakdown, summary?.totalMembers]
  );

  const debtorRecords = useMemo(() => {
    if (members.length > 0) return members;
    return debtors;
  }, [debtors, members]);

  const debtorBreakdown = useMemo(() => buildDebtorActivityBreakdown(debtorRecords), [debtorRecords]);
  const mainDebtorBreakdown = debtorBreakdown.slice(0, 3);
  const remainingDebtorActivities = Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0);
  const totalDebtors = debtorBreakdown.reduce((total, item) => total + item.count, 0);
  const maxDebtorActivityCount = mainDebtorBreakdown[0]?.count ?? 0;

  const activeActivityBreakdown = useMemo(() => buildActiveActivityBreakdown(members), [members]);
  const mainActiveActivityBreakdown = activeActivityBreakdown.slice(0, 6);
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

  const estimatedDebt = financeSummary?.cuotasAdeudadas ?? summary?.totalEstimatedDebt;
  const syncBadgeLabel = syncLabel;
  const lastSyncLabel = `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`;
  const unavailableLabel = financeError ? 'No disponible' : '—';
  const formatFinanceMoney = (value: number | undefined) => financeSummary ? formatArPeso(value) : unavailableLabel;
  const formatUsd = (value: number | undefined) => financeSummary ? `USD ${Math.round(value ?? 0).toLocaleString('es-AR')}` : unavailableLabel;
  const financialSummaryLines: FinancialLine[] = [
    { label: 'Liquidez', value: formatFinanceMoney(financeSummary?.liquidity) },
    { label: 'Caja', value: formatFinanceMoney(financeSummary?.cash) },
    { label: 'Banco', value: formatFinanceMoney(financeSummary?.bank) },
    { label: 'Dólares', value: formatUsd(financeSummary?.dollars) }
  ];
  const operationalBalanceLines: FinancialLine[] = [
    { label: 'Cuotas Adeudadas', value: financeSummary || typeof estimatedDebt === 'number' ? formatArPeso(estimatedDebt) : unavailableLabel },
    { label: 'Saldos Pendientes', value: formatFinanceMoney(financeSummary?.pendingNetBalance) },
    { label: 'Saldos a Pagar', value: formatFinanceMoney(financeSummary?.saldosAPagar) },
    { label: 'Saldo proyectado', value: formatFinanceMoney(financeSummary?.projectedBalance) }
  ];
  const incomeBySectorLines: FinancialLine[] = financeSummary?.incomeBySector.length
    ? financeSummary.incomeBySector.map((item) => ({ id: `income-${item.name}`, label: item.name, value: formatArPeso(item.amount) }))
    : [{ id: 'income-unavailable', label: 'Ingresos', value: unavailableLabel }];
  const expenseBySectorLines: FinancialLine[] = financeSummary?.expenseBySector.length
    ? financeSummary.expenseBySector.map((item) => ({ id: `expense-${item.name}`, label: item.name, value: formatArPeso(item.amount) }))
    : [{ id: 'expense-unavailable', label: 'Egresos', value: unavailableLabel }];

  return (
    <main className="module-content">
      <section className="module-hero home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Inicio</p>
          <h2>Panel operativo de miClub</h2>
          <p>Resumen ejecutivo e indicadores generales.</p>
        </div>
        <div className="home-sync-badges" aria-label="Sincronización del inicio">
          <span
            className={syncStatus?.error ? 'home-sync-badge home-sync-badge--warning' : 'home-sync-badge'}
            title={syncStatus?.error}
          >
            {syncBadgeLabel}
          </span>
          <span className="home-sync-badge home-sync-badge--muted">{lastSyncLabel}</span>
          <button className="icon-btn home-sync-button" onClick={() => void loadHome()} disabled={loading}>Sincronizar</button>
        </div>
      </section>

      {error && <p className="error-msg">Error: {error}</p>}
      {loading && <p className="section-note">Cargando métricas del club...</p>}

      <section className="home-dashboard-stack" aria-label="Resumen operativo del club">
        <div className="home-dashboard-row home-dashboard-row--primary">
          <article className="card home-kpi-card home-kpi-card--enrollment">
            <div className="home-card-heading">
              <h4>👥 Inscriptos</h4>
              <p>Estados operativos actuales</p>
            </div>
            <div className="enrollment-summary">
              <p className="home-kpi-value">{enrollmentStats.total}</p>
              <span>Total de inscriptos</span>
            </div>
            <div className="status-breakdown-grid">
              <span><strong>Activos</strong>{enrollmentStats.active}</span>
              <span><strong>Al día</strong>{enrollmentStats.current}</span>
              <span><strong>Nuevos inscriptos</strong>{enrollmentStats.newEnrollment}</span>
              <span><strong>Adeudando</strong>{enrollmentStats.debtor}</span>
              <span><strong>Abandonados</strong>{enrollmentStats.abandoned}</span>
            </div>
            <div className="debtor-activity-panel">
              <div className="debtor-activity-panel__heading">
                <strong>Adeudados por actividad</strong>
                <span>{totalDebtors} deudores</span>
              </div>
              <div className="activity-breakdown-list activity-breakdown-list--compact">
                {renderActivityBreakdown(mainDebtorBreakdown, maxDebtorActivityCount, 'Sin deudores registrados')}
                {remainingDebtorActivities > 0 && <small>+ {remainingDebtorActivities} actividades</small>}
              </div>
            </div>
          </article>

          <article className="card home-kpi-card">
            <div className="home-card-heading">
              <h4>🏷️ Inscriptos por actividad</h4>
              <p>Solo inscriptos activos</p>
            </div>
            <div className="activity-breakdown-list activity-breakdown-list--featured">
              {renderActivityBreakdown(mainActiveActivityBreakdown, maxActiveActivityCount, 'Sin actividades activas registradas')}
              {remainingActiveActivities > 0 && <small>+ {remainingActiveActivities} actividades</small>}
            </div>
          </article>
        </div>

        <div className="home-dashboard-row home-dashboard-row--secondary">
          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>📊 Resumen financiero</h4>
              <p>Indicadores económicos futuros</p>
            </div>
            {renderFinanceLines(financialSummaryLines)}
            {financeError && <small className="integration-note">{financeError}</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>🏦 Saldos operativos</h4>
              <p>Base preparada para ADMINISTRACIÓN</p>
            </div>
            {renderFinanceLines(operationalBalanceLines)}
            {financeError && <small className="integration-note">Pendiente de integración</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>📥 Ingresos por sector</h4>
              <p>Sector · monto</p>
            </div>
            {renderFinanceLines(incomeBySectorLines)}
            {financeSummary && financeSummary.remainingIncomeSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingIncomeSectors} sectores</small>}
            {financeError && <small className="integration-note">No disponible</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact home-kpi-card--finance">
            <div className="home-card-heading">
              <h4>📤 Egresos por sector</h4>
              <p>Sector · monto</p>
            </div>
            {renderFinanceLines(expenseBySectorLines)}
            {financeSummary && financeSummary.remainingExpenseSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingExpenseSectors} sectores</small>}
            {financeError && <small className="integration-note">No disponible</small>}
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
