import { useEffect, useMemo, useState } from 'react';
import type { ClubOperationsSummary, Member, SectorOperationalSummary, StatusBreakdown as ApiStatusBreakdown } from '@miclub/shared';
import { formatArPeso } from '../utils';
import type { ModuleId } from './ModuleNav';
import { apiUrl } from '../api';


type SyncStatus = {
  source: 'mock' | 'google_sheets' | 'postgres';
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
  highlight?: 'default' | 'green' | 'red' | 'primarySoft' | 'positiveCritical' | 'negativeCritical';
  iconBefore?: string;
  iconAfter?: string;
};

type SectorMetric = {
  label: string;
  value: string;
  className?: string;
};

type SectorFeaturedMetric = {
  label: string;
  value: string;
  detail?: string;
};

type SectorCardConfig = {
  key: string;
  title: string;
  moduleId: ModuleId;
  subtitle: string;
  icon: string;
  accent: 'fitness' | 'salon' | 'aula' | 'local1' | 'cantina' | 'crm';
  mainMetric: SectorMetric;
  secondaryMetrics: SectorMetric[];
  featuredMetric?: SectorFeaturedMetric;
};

const MONTH_NAMES_ES_UPPER = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'] as const;

const getCurrentSpanishMonthUpper = () => MONTH_NAMES_ES_UPPER[new Date().getMonth()];

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

const normalizeText = (value?: string) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

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

const parseMemberFee = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const calculateWeightedAverageFee = (records: Member[]) => {
  const activeMembersWithFee = records
    .map((member) => ({ member, fee: parseMemberFee(member.cuota) }))
    .filter(({ member, fee }) => isActiveMember(member) && fee > 0);

  if (activeMembersWithFee.length === 0) return undefined;

  const totalFees = activeMembersWithFee.reduce((total, { fee }) => total + fee, 0);
  return totalFees / activeMembersWithFee.length;
};

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

const renderActivityBreakdown = (
  items: ActivityBreakdownItem[],
  maxCount: number,
  emptyLabel: string,
  highlightFirst: false | 'featured' | 'warning' = false
) => (
  items.length > 0 ? items.map((item, index) => {
    const isHighlighted = Boolean(highlightFirst) && index === 0;
    const highlightClass = highlightFirst === 'warning'
      ? 'activity-breakdown-item--warning'
      : 'activity-breakdown-item--highlight';
    const className = isHighlighted
      ? `activity-breakdown-item ${highlightClass}`
      : 'activity-breakdown-item';
    const marker = isHighlighted && highlightFirst === 'warning' ? '⚠ ' : '';
    const suffix = highlightFirst === 'featured' ? ' ⭐' : '';

    return (
      <div className={className} key={item.activity}>
        <div className="activity-breakdown-row">
          <span>{marker}{item.activity}{isHighlighted ? suffix : ''}</span>
          <strong>{item.count}</strong>
        </div>
        <div className="activity-breakdown-track" aria-hidden="true">
          <span style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }} />
        </div>
      </div>
    );
  }) : <p className="empty-card-note">{emptyLabel}</p>
);

const getMetricRowClassName = (highlight?: FinancialLine['highlight']) => {
  if (highlight === 'positiveCritical') return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-positive-critical';
  if (highlight === 'negativeCritical') return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-negative-critical';
  if (highlight === 'green') return 'finance-metric-row finance-metric-row--highlight-green';
  if (highlight === 'red') return 'finance-metric-row finance-metric-row--highlight-red';
  if (highlight === 'primarySoft') return 'finance-metric-row finance-metric-row--highlight-soft';
  if (highlight === 'default') return 'finance-metric-row finance-metric-row--highlight';
  return 'finance-metric-row';
};

const renderFinanceLines = (lines: FinancialLine[]) => (
  <div className="finance-lines finance-lines--compact">
    {lines.map((line) => (
      <span key={line.id ?? line.label} className={getMetricRowClassName(line.highlight)}>
        <strong className="finance-metric-row__label">{line.iconBefore ? `${line.iconBefore} ` : ''}{line.label}{line.iconAfter ? ` ${line.iconAfter}` : ''}</strong>
        <span className="finance-metric-row__value">{line.value}</span>
      </span>
    ))}
  </div>
);

export default function HomeModule({ onOpenModule }: HomeModuleProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [financeSummary, setFinanceSummary] = useState<ClubOperationsSummary | null>(null);
  const [sectorSummary, setSectorSummary] = useState<SectorOperationalSummary | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = async () => {
    setLoading(true);
    setError(null);
    setFinanceError(null);
    setSectorError(null);
    try {
      const financePromise = fetch(apiUrl('/club-finance-summary'))
        .then(async (response) => {
          if (!response.ok) throw new Error('No se pudo cargar el resumen financiero.');
          return response.json() as Promise<ClubOperationsSummary>;
        })
        .catch((financeLoadError) => {
          setFinanceError(financeLoadError instanceof Error ? financeLoadError.message : 'Resumen financiero no disponible.');
          return null;
        });

      const sectorPromise = fetch(apiUrl('/sector-operational-summary'))
        .then(async (response) => {
          if (!response.ok) throw new Error('No se pudo cargar el resumen operativo por sector.');
          return response.json() as Promise<SectorOperationalSummary>;
        })
        .catch((sectorLoadError) => {
          setSectorError(sectorLoadError instanceof Error ? sectorLoadError.message : 'Resumen operativo por sector no disponible.');
          return null;
        });

      const [summaryRes, membersRes, debtorsRes, syncRes, financePayload, sectorPayload] = await Promise.all([
        fetch(apiUrl('/summary')),
        fetch(apiUrl('/members')),
        fetch(apiUrl('/debtors')),
        fetch(apiUrl('/sync-status')),
        financePromise,
        sectorPromise
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
      setSectorSummary(sectorPayload);
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

  const weightedAverageFee = useMemo(() => calculateWeightedAverageFee(members), [members]);
  const weightedAverageFeeLabel = weightedAverageFee === undefined ? '—' : formatArPeso(weightedAverageFee);

  const estimatedDebt = financeSummary?.cuotasACobrar ?? financeSummary?.cuotasAdeudadas ?? summary?.totalEstimatedDebt;
  const syncBadgeLabel = syncLabel;
  const lastSyncLabel = `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`;
  const unavailableLabel = financeError ? 'No disponible' : '—';
  const formatFinanceMoney = (value: number | undefined) => financeSummary ? formatArPeso(value) : unavailableLabel;
  const formatPayableObligation = (value: number | undefined) => financeSummary ? `-${formatArPeso(Math.abs(value ?? 0))}` : unavailableLabel;
  const formatUsd = (value: number | undefined) => financeSummary ? `USD ${Math.round(value ?? 0).toLocaleString('es-AR')}` : unavailableLabel;
  const financialSummaryLines: FinancialLine[] = [
    { label: 'Liquidez', value: formatFinanceMoney(financeSummary?.liquidity), highlight: 'positiveCritical', iconBefore: '💰' },
    { label: 'Caja', value: formatFinanceMoney(financeSummary?.cash) },
    { label: 'Banco', value: formatFinanceMoney(financeSummary?.bank) },
    { label: 'Dólares', value: formatUsd(financeSummary?.dollars) }
  ];
  const operationalBalanceLines: FinancialLine[] = [
    { label: 'Cuotas a cobrar', value: financeSummary || typeof estimatedDebt === 'number' ? formatArPeso(estimatedDebt) : unavailableLabel },
    { label: 'Saldos Pendientes', value: formatFinanceMoney(financeSummary?.pendingNetBalance) },
    { label: 'Saldos a Pagar', value: formatPayableObligation(financeSummary?.saldosAPagar) },
    { label: 'Saldo proyectado', value: formatFinanceMoney(financeSummary?.projectedBalance), highlight: 'positiveCritical', iconBefore: '📈' }
  ];
  const incomeBySectorLines: FinancialLine[] = financeSummary?.incomeBySector.length
    ? financeSummary.incomeBySector.map((item, index) => ({ id: `income-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'positiveCritical' : undefined, iconAfter: index === 0 ? '⭐' : undefined }))
    : [{ id: 'income-unavailable', label: 'Ingresos', value: unavailableLabel }];
  const expenseBySectorLines: FinancialLine[] = financeSummary?.expenseBySector.length
    ? financeSummary.expenseBySector.map((item, index) => ({ id: `expense-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'negativeCritical' : undefined, iconAfter: index === 0 ? '🔻' : undefined }))
    : [{ id: 'expense-unavailable', label: 'Egresos', value: unavailableLabel }];

  const formatOptionalNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-AR') : '—';
  const formatOptionalMoney = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatArPeso(value) : '—';
  const formatOptionalPercent = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 2 }).format(value > 1 ? value / 100 : value) : '—';
  const formatArDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-AR');
  };
  const formatActivityHighlight = (name?: string, count?: number, featured = false) => name ? `${featured ? '⭐ ' : ''}${name} · ${formatOptionalNumber(count)}` : '—';
  const currentMonthProfitabilityLabel = `RENTABILIDAD ${getCurrentSpanishMonthUpper()}`;
  const highlightedLocalIncome = sectorSummary?.local1.highlightedIncome;
  const sectorCards: SectorCardConfig[] = [
    {
      key: 'fitness',
      title: 'Espacio Fitness',
      moduleId: 'fitness',
      subtitle: 'Membresías y liquidación',
      icon: '🏋️',
      accent: 'fitness',
      mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.fitness.totalProfitability) },
      secondaryMetrics: [
        { label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.fitness.totalMembers) },
        { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.fitness.activeMembers) },
        { label: 'ADEUDADOS', value: formatOptionalNumber(sectorSummary?.fitness.totalDebtors) },
        { label: 'MONTO ADEUDADOS', value: formatOptionalMoney(sectorSummary?.fitness.totalDebtAmount) },
        { label: currentMonthProfitabilityLabel, value: formatOptionalMoney(sectorSummary?.fitness.currentMonthProfitability) },
        { label: 'SALDO A LIQUIDAR', value: formatOptionalMoney(sectorSummary?.fitness.settlementBalance) }
      ]
    },
    {
      key: 'local1',
      title: 'Local 1',
      moduleId: 'local1',
      subtitle: 'Ingresos relevantes',
      icon: '🏪',
      accent: 'local1',
      mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.local1.totalProfitability) },
      secondaryMetrics: [
        { label: 'TOTAL VENTAS', value: formatOptionalNumber(sectorSummary?.local1.totalRelevantIncomeMovements) },
        { label: 'Últ. 30 días', value: formatOptionalNumber(sectorSummary?.local1.last30DaysRelevantIncomeMovements) },
        { label: currentMonthProfitabilityLabel, value: formatOptionalMoney(sectorSummary?.local1.currentMonthProfitability) },
        { label: 'SALDO A LIQUIDAR', value: formatOptionalMoney(sectorSummary?.local1.settlementBalance) }
      ],
      featuredMetric: highlightedLocalIncome
        ? { label: 'Ingreso destacado', value: formatOptionalMoney(highlightedLocalIncome.amount), detail: `${highlightedLocalIncome.concept} · ${formatArDate(highlightedLocalIncome.date)}` }
        : { label: 'Ingreso destacado', value: '—' }
    },
    {
      key: 'salon',
      title: 'Salón',
      moduleId: 'salon',
      subtitle: 'Actividades EC',
      icon: '🎭',
      accent: 'salon',
      mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.salon.totalProfitability) },
      secondaryMetrics: [
        { label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.salon.totalMembers) },
        { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.salon.activeMembers) },
        { label: currentMonthProfitabilityLabel, value: formatOptionalMoney(sectorSummary?.salon.currentMonthProfitability) },
        { label: 'MENOS POPULAR', value: formatActivityHighlight(sectorSummary?.salon.leastPopularActivity?.name, sectorSummary?.salon.leastPopularActivity?.members), className: 'area-card__metric--subtle-alert' }
      ],
      featuredMetric: { label: 'MÁS POPULAR', value: formatActivityHighlight(sectorSummary?.salon.mostPopularActivity?.name, sectorSummary?.salon.mostPopularActivity?.members, true) }
    },
    {
      key: 'aula',
      title: 'Aula',
      moduleId: 'aula',
      subtitle: 'Talleres y comisiones',
      icon: '🎓',
      accent: 'aula',
      mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.aula.totalProfitability) },
      secondaryMetrics: [
        { label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.aula.totalMembers) },
        { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.aula.activeMembers) },
        { label: currentMonthProfitabilityLabel, value: formatOptionalMoney(sectorSummary?.aula.currentMonthProfitability) },
        { label: 'Comisión prom.', value: formatOptionalPercent(sectorSummary?.aula.averageCommission) }
      ],
      featuredMetric: { label: 'MÁS POPULAR', value: formatActivityHighlight(sectorSummary?.aula.mostPopularActivity?.name, sectorSummary?.aula.mostPopularActivity?.members, true) }
    },
    {
      key: 'cantina',
      title: 'Cantina',
      moduleId: 'cantina',
      subtitle: 'Ventas y CMV',
      icon: '☕',
      accent: 'cantina',
      mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.cantina.totalProfitability) },
      secondaryMetrics: [
        { label: 'KIOSCO', value: formatOptionalMoney(sectorSummary?.cantina.kioskIncome) },
        { label: 'BEBIDAS', value: formatOptionalMoney(sectorSummary?.cantina.drinksIncome) },
        { label: 'CMV', value: formatOptionalMoney(sectorSummary?.cantina.cmv) }
      ]
    },
    {
      key: 'crm',
      title: 'CRM',
      moduleId: 'crm',
      subtitle: 'Inscriptos y cobranzas',
      icon: '💬',
      accent: 'crm',
      mainMetric: { label: 'Inscriptos', value: formatOptionalNumber(sectorSummary?.crm.totalMembers) },
      secondaryMetrics: [
        { label: 'Activos', value: formatOptionalNumber(sectorSummary?.crm.activeMembers) },
        { label: 'Adeudados', value: formatOptionalNumber(sectorSummary?.crm.totalDebtors) },
        { label: 'Monto adeudado', value: formatOptionalMoney(sectorSummary?.crm.totalDebtAmount) }
      ]
    }
  ];

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
            className={syncStatus?.error ? 'home-sync-badge hero-sync-badge--compact home-sync-badge--warning' : 'home-sync-badge hero-sync-badge--compact'}
            title={syncStatus?.error}
          >
            {syncBadgeLabel}
          </span>
          <span className="home-sync-badge hero-sync-badge--compact home-sync-badge--muted">{lastSyncLabel}</span>
          <button className="icon-btn home-sync-button" onClick={() => void loadHome()} disabled={loading}>Sincronizar</button>
        </div>
      </section>

      {error && <p className="error-msg">Error: {error}</p>}
      {loading && <p className="section-note">Cargando métricas del club...</p>}

      <section className="home-dashboard-stack" aria-label="Resumen operativo del club">
        <div className="home-dashboard-row home-dashboard-row--secondary">
          <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--summary">
            <div className="home-card-heading finance-card__header">
              <h4>📊 Resumen financiero</h4>
              <p>Indicadores económicos actuales</p>
            </div>
            {renderFinanceLines(financialSummaryLines)}
            {financeError && <small className="integration-note">{financeError}</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--balance">
            <div className="home-card-heading finance-card__header">
              <h4>🏦 Saldos operativos</h4>
              <p>Saldos y proyección operativa</p>
            </div>
            {renderFinanceLines(operationalBalanceLines)}
            {financeError && <small className="integration-note">Pendiente de integración</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--income">
            <div className="home-card-heading finance-card__header">
              <h4>📥 Ingresos por sector</h4>
              <p>Sector · monto</p>
            </div>
            {renderFinanceLines(incomeBySectorLines)}
            {financeSummary && financeSummary.remainingIncomeSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingIncomeSectors} sectores</small>}
            {financeError && <small className="integration-note">No disponible</small>}
          </article>

          <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--expense">
            <div className="home-card-heading finance-card__header">
              <h4>📤 Egresos por sector</h4>
              <p>Sector · monto</p>
            </div>
            {renderFinanceLines(expenseBySectorLines)}
            {financeSummary && financeSummary.remainingExpenseSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingExpenseSectors} sectores</small>}
            {financeError && <small className="integration-note">No disponible</small>}
          </article>
        </div>

        <div className="home-dashboard-row home-dashboard-row--primary">
          <article className="card home-kpi-card home-kpi-card--modern home-kpi-card--enrollment">
            <div className="home-card-heading">
              <h4>👥 Inscriptos</h4>
              <p>Estados operativos actuales</p>
            </div>
            <div className="enrollment-summary">
              <p className="home-kpi-value">{enrollmentStats.total}</p>
              <span>Total de inscriptos</span>
            </div>
            <div className="status-breakdown-grid">
              <span className="metric-row metric-row--highlight-green"><strong className="metric-row__label">Activos</strong><span className="metric-row__value">{enrollmentStats.active}</span></span>
              <span className="metric-row"><strong className="metric-row__label">Al día</strong><span className="metric-row__value">{enrollmentStats.current}</span></span>
              <span className="metric-row"><strong className="metric-row__label">Nuevos inscriptos</strong><span className="metric-row__value">{enrollmentStats.newEnrollment}</span></span>
              <span className="metric-row"><strong className="metric-row__label">Adeudando</strong><span className="metric-row__value">{enrollmentStats.debtor}</span></span>
              <span className="metric-row"><strong className="metric-row__label">Abandonados</strong><span className="metric-row__value">{enrollmentStats.abandoned}</span></span>
              <span className="metric-row"><strong className="metric-row__label">Cuota Promedio</strong><span className="metric-row__value">{weightedAverageFeeLabel}</span></span>
            </div>
            <div className="debtor-activity-panel">
              <div className="debtor-activity-panel__heading">
                <strong>Adeudados por actividad</strong>
                <span>{totalDebtors} deudores</span>
              </div>
              <div className="activity-breakdown-list activity-breakdown-list--compact">
                {renderActivityBreakdown(mainDebtorBreakdown, maxDebtorActivityCount, 'Sin deudores registrados', 'warning')}
                {remainingDebtorActivities > 0 && <small>+ {remainingDebtorActivities} actividades</small>}
              </div>
            </div>
          </article>

          <article className="card home-kpi-card home-kpi-card--modern home-kpi-card--activity">
            <div className="home-card-heading">
              <h4>🏷️ Inscriptos por actividad</h4>
              <p>Solo inscriptos activos</p>
            </div>
            <div className="activity-breakdown-list activity-breakdown-list--featured">
              {renderActivityBreakdown(mainActiveActivityBreakdown, maxActiveActivityCount, 'Sin actividades activas registradas', 'featured')}
              {remainingActiveActivities > 0 && <small>+ {remainingActiveActivities} actividades</small>}
            </div>
          </article>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Distribución operativa por sector</h3>
            <p>Resumen operativo real por sector con datos de gestión general.</p>
          </div>
          <button className="icon-btn ghost-btn" onClick={() => void loadHome()}>Actualizar inicio</button>
        </div>
        {sectorError && <small className="integration-note">{sectorError}</small>}
        <div className="area-grid">
          {sectorCards.map((area) => (
            <article key={area.key} className={`area-card area-card--${area.accent}`}>
              <div className="area-card__topline" aria-hidden="true" />
              <div className="area-card__heading">
                <span className="area-card__icon" aria-hidden="true">{area.icon}</span>
                <div className="area-card__title-block">
                  <h4>{area.title}</h4>
                  <p>{area.subtitle}</p>
                </div>
                <button className="area-card__module-link" onClick={() => onOpenModule(area.moduleId)}>Ver módulo</button>
              </div>

              <div className="area-card__primary-metric">
                <span>{area.mainMetric.label}</span>
                <strong>{area.mainMetric.value}</strong>
              </div>

              <dl className="area-card__metrics">
                {area.secondaryMetrics.map((metric) => (
                  <div className={`area-card__metric${metric.className ? ` ${metric.className}` : ''}`} key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>

              {area.featuredMetric && (
                <div className="area-card__featured-metric">
                  <span>{area.featuredMetric.label}</span>
                  <strong>{area.featuredMetric.value}</strong>
                  {area.featuredMetric.detail && <small>{area.featuredMetric.detail}</small>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
