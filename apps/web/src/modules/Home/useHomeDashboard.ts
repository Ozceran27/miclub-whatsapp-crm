import { useEffect, useMemo, useState } from 'react';
import type { ClubOperationsSummary, Member, SectorOperationalSummary, StatusBreakdown as ApiStatusBreakdown } from '@miclub/shared';
import { apiUrl } from '../../api';
import { formatArPeso } from '../../utils';
import type { ModuleId } from '../ModuleNav';

export type SyncStatus = {
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

type ActivityBreakdownItem = {
  activity: string;
  count: number;
};

export type FinancialLine = {
  id?: string;
  label: string;
  value: string;
  highlight?: 'default' | 'green' | 'red' | 'primarySoft' | 'positiveCritical' | 'negativeCritical';
  iconBefore?: string;
  iconAfter?: string;
};

export type SectorMetric = {
  label: string;
  value: string;
  className?: string;
  title?: string;
};

export type SectorFeaturedMetric = {
  label: string;
  value: string;
  detail?: string;
  title?: string;
};

export type SectorCardConfig = {
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

export type StatusBreakdown = {
  total: number;
  active: number;
  current: number;
  newEnrollment: number;
  debtor: number;
  abandoned: number;
  cancelled: number;
  others: number;
};

export type HomeDashboardState = ReturnType<typeof useHomeDashboard>;

const MONTH_NAMES_ES_UPPER = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'] as const;

const getCurrentSpanishMonthUpper = () => MONTH_NAMES_ES_UPPER[new Date().getMonth()];

const STATUS_ALIASES: Record<string, 'current' | 'newEnrollment' | 'debtor' | 'abandoned' | 'cancelled'> = {
  'al dia': 'current', aldia: 'current', activo: 'current', activos: 'current',
  'nuevo inscripto': 'newEnrollment', nuevoinscripto: 'newEnrollment', 'nuevo inscrito': 'newEnrollment', nuevoinscrito: 'newEnrollment', nuevo: 'newEnrollment',
  adeudando: 'debtor', deudor: 'debtor', deudores: 'debtor', deuda: 'debtor',
  abandonado: 'abandoned', abandonada: 'abandoned', abandono: 'abandoned', inactivo: 'abandoned', inactivos: 'abandoned',
  cancelado: 'cancelled', cancelada: 'cancelled', cancelacion: 'cancelled'
};

const normalizeText = (value?: string) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

const formatDateTime = (value?: string) => {
  if (!value) return 'Sin sincronización registrada';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};

const normalizeStatus = (status?: string) => normalizeText(status).replace(/[-–—_/]+/g, ' ').replace(/[^a-z0-9ñ\s]/g, '').replace(/\s+/g, ' ').trim();

const getStatusBucketFromRawStatus = (status?: string) => {
  const normalized = normalizeStatus(status);
  const compact = normalized.replace(/\s/g, '');
  if (STATUS_ALIASES[normalized]) return STATUS_ALIASES[normalized];
  if (STATUS_ALIASES[compact]) return STATUS_ALIASES[compact];
  if (normalized.includes('nuevo') && (normalized.includes('inscripto') || normalized.includes('inscrito'))) return 'newEnrollment';
  if (normalized.includes('abandon')) return 'abandoned';
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('adeud') || normalized.includes('deud')) return 'debtor';
  if (normalized.includes('al dia') || compact.includes('aldia')) return 'current';
  return undefined;
};

const getStatusBucket = (member: Member) => getStatusBucketFromRawStatus(normalizeStatus(String(member.estado ?? '')));
const isActiveMember = (member: Member) => !['abandoned', 'cancelled'].includes(getStatusBucket(member) ?? '');
const isDebtor = (member: Member) => getStatusBucket(member) === 'debtor';

const parseMemberFee = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const calculateWeightedAverageFee = (records: Member[]) => {
  const activeMembersWithFee = records.map((member) => ({ member, fee: parseMemberFee(member.cuota) })).filter(({ member, fee }) => isActiveMember(member) && fee > 0);
  if (activeMembersWithFee.length === 0) return undefined;
  return activeMembersWithFee.reduce((total, { fee }) => total + fee, 0) / activeMembersWithFee.length;
};

const getActivityName = (member: Member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';

const getEnrollmentStatusBreakdown = (records: Member[], fallbackTotal?: number): StatusBreakdown => {
  const breakdown: StatusBreakdown = { total: records.length || fallbackTotal || 0, active: 0, current: 0, newEnrollment: 0, debtor: 0, abandoned: 0, cancelled: 0, others: 0 };
  records.forEach((member) => {
    const bucket = getStatusBucket(member);
    if (bucket === 'current') breakdown.current += 1;
    if (bucket === 'newEnrollment') breakdown.newEnrollment += 1;
    if (bucket === 'debtor') breakdown.debtor += 1;
    if (bucket === 'abandoned') breakdown.abandoned += 1;
    if (bucket === 'cancelled') breakdown.cancelled += 1;
    if (!bucket) breakdown.others += 1;
  });
  breakdown.active = records.filter(isActiveMember).length;
  return breakdown;
};

const mapSummaryStatusBreakdown = (statusBreakdown?: ApiStatusBreakdown): StatusBreakdown | undefined => statusBreakdown ? {
  total: statusBreakdown.total, active: statusBreakdown.active, current: statusBreakdown.alDia, newEnrollment: statusBreakdown.nuevoInscripto, debtor: statusBreakdown.adeudando, abandoned: statusBreakdown.abandonado, cancelled: statusBreakdown.cancelado, others: statusBreakdown.otros
} : undefined;

const buildActivityBreakdown = (records: Member[]): ActivityBreakdownItem[] => {
  const counts = new Map<string, number>();
  records.forEach((member) => counts.set(getActivityName(member), (counts.get(getActivityName(member)) ?? 0) + 1));
  return Array.from(counts.entries()).map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count || a.activity.localeCompare(b.activity, 'es'));
};

const isFiniteNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

export function useHomeDashboard() {
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
    setLoading(true); setError(null); setFinanceError(null); setSectorError(null);
    try {
      const financePromise = fetch(apiUrl('/club-finance-summary'), { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('No se pudo cargar el resumen financiero.'); return response.json() as Promise<ClubOperationsSummary>; }).catch((financeLoadError) => { setFinanceError(financeLoadError instanceof Error ? financeLoadError.message : 'Resumen financiero no disponible.'); return null; });
      const sectorPromise = fetch(apiUrl('/sector-operational-summary'), { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('No se pudo cargar el resumen operativo por sector.'); return response.json() as Promise<SectorOperationalSummary>; }).catch((sectorLoadError) => { setSectorError(sectorLoadError instanceof Error ? sectorLoadError.message : 'Resumen operativo por sector no disponible.'); return null; });
      const [summaryRes, membersRes, debtorsRes, syncRes, financePayload, sectorPayload] = await Promise.all([fetch(apiUrl('/summary'), { cache: 'no-store' }), fetch(apiUrl('/members'), { cache: 'no-store' }), fetch(apiUrl('/debtors'), { cache: 'no-store' }), fetch(apiUrl('/sync-status'), { cache: 'no-store' }), financePromise, sectorPromise]);
      if (!summaryRes.ok || !membersRes.ok || !debtorsRes.ok || !syncRes.ok) throw new Error('No se pudo cargar el inicio operativo.');
      const [summaryPayload, membersPayload, debtorsPayload, syncPayload] = await Promise.all([summaryRes.json(), membersRes.json(), debtorsRes.json(), syncRes.json()]);
      setSummary(summaryPayload as Summary); setMembers(membersPayload as Member[]); setDebtors(debtorsPayload as Member[]); setSyncStatus(syncPayload as SyncStatus); setFinanceSummary(financePayload); setSectorSummary(sectorPayload);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error desconocido al cargar el inicio.'); } finally { setLoading(false); }
  };

  useEffect(() => { void loadHome(); }, []);

  return useMemo(() => {
    const syncLabel = !syncStatus ? 'No disponible' : syncStatus.error ? 'Con advertencias' : syncStatus.source === 'google_sheets' ? 'Google Sheets conectado' : 'Datos mock/locales';
    const enrollmentStats = mapSummaryStatusBreakdown(summary?.statusBreakdown) ?? getEnrollmentStatusBreakdown(members, summary?.totalMembers);
    const debtorRecords = members.length > 0 ? members : debtors;
    const debtorBreakdown = buildActivityBreakdown(debtorRecords.filter(isDebtor));
    const mainDebtorBreakdown = debtorBreakdown.slice(0, 3);
    const activeActivityBreakdown = buildActivityBreakdown(members.filter(isActiveMember));
    const mainActiveActivityBreakdown = activeActivityBreakdown.slice(0, 6);
    const weightedAverageFee = calculateWeightedAverageFee(members);
    const unavailableLabel = financeError ? 'No disponible' : '—';
    const estimatedDebt = financeSummary?.cuotasACobrar ?? financeSummary?.cuotasAdeudadas ?? summary?.totalEstimatedDebt;
    const formatFinanceMoney = (value: number | undefined) => financeSummary && isFiniteNumber(value) ? formatArPeso(value) : unavailableLabel;
    const formatUsd = (value: number | undefined) => financeSummary && isFiniteNumber(value) ? `USD ${Math.round(value).toLocaleString('es-AR')}` : unavailableLabel;
    const financialSummaryLines: FinancialLine[] = [{ label: 'Liquidez', value: formatFinanceMoney(financeSummary?.liquidity), highlight: 'positiveCritical', iconBefore: '💰' }, { label: 'Caja', value: formatFinanceMoney(financeSummary?.cash) }, { label: 'Banco', value: formatFinanceMoney(financeSummary?.bank) }, { label: 'Dólares', value: formatUsd(financeSummary?.dollars) }];
    const operationalBalanceLines: FinancialLine[] = [{ label: 'Cuotas a cobrar', value: isFiniteNumber(estimatedDebt) ? formatArPeso(estimatedDebt) : unavailableLabel }, { label: 'Saldos a Liquidar', value: formatFinanceMoney(financeSummary?.settlementBalance ?? financeSummary?.saldosAPagar) }, { label: 'Saldos Pendientes', value: formatFinanceMoney(financeSummary?.pendingNetBalance) }, { label: 'Saldo proyectado', value: formatFinanceMoney(financeSummary?.projectedBalance), highlight: 'positiveCritical', iconBefore: '📈' }];
    const incomeBySectorLines: FinancialLine[] = financeSummary?.incomeBySector.length ? financeSummary.incomeBySector.map((item, index) => ({ id: `income-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'positiveCritical' : undefined, iconAfter: index === 0 ? '⭐' : undefined })) : [{ id: 'income-unavailable', label: 'Ingresos', value: unavailableLabel }];
    const expenseBySectorLines: FinancialLine[] = financeSummary?.expenseBySector.length ? financeSummary.expenseBySector.map((item, index) => ({ id: `expense-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'negativeCritical' : undefined, iconAfter: index === 0 ? '🔻' : undefined })) : [{ id: 'expense-unavailable', label: 'Egresos', value: unavailableLabel }];
    const formatOptionalNumber = (value: number | null | undefined) => isFiniteNumber(value) ? value.toLocaleString('es-AR') : '—';
    const formatOptionalMoney = (value: number | null | undefined) => isFiniteNumber(value) ? formatArPeso(value) : '—';
    const formatOptionalPercent = (value: number | null | undefined) => isFiniteNumber(value) ? new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 2 }).format(value > 1 ? value / 100 : value) : '—';
    const pendingMetricLabel = '— · pendiente de cálculo';
    const unavailableMetricTitle = 'Métrica pendiente de cálculo en PostgreSQL';
    const isSectorMetricUnavailable = (path: string) => sectorSummary?.metadata?.sourceCompleteness?.[path]?.status === 'unavailable';
    const formatSectorMoney = (path: string, value: number | null | undefined) => isSectorMetricUnavailable(path) ? pendingMetricLabel : formatOptionalMoney(value);
    const formatSectorPercent = (path: string, value: number | null | undefined) => isSectorMetricUnavailable(path) ? pendingMetricLabel : formatOptionalPercent(value);
    const pendingMetricProps = (path: string) => isSectorMetricUnavailable(path) ? { className: 'area-card__metric--pending', title: unavailableMetricTitle } : {};
    const formatArDate = (value?: string) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR'); };
    const formatActivityHighlight = (name?: string, count?: number, featured = false) => name ? `${featured ? '⭐ ' : ''}${name} · ${formatOptionalNumber(count)}` : '—';
    const currentMonthProfitabilityLabel = `RENTABILIDAD ${getCurrentSpanishMonthUpper()}`;
    const highlightedLocalIncome = sectorSummary?.local1.highlightedIncome;
    const sectorCards: SectorCardConfig[] = [
      { key: 'fitness', title: 'Espacio Fitness', moduleId: 'fitness', subtitle: 'Membresías y liquidación', icon: '🏋️', accent: 'fitness', mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatSectorMoney('fitness.totalProfitability', sectorSummary?.fitness.totalProfitability), ...pendingMetricProps('fitness.totalProfitability') }, secondaryMetrics: [{ label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.fitness.totalMembers) }, { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.fitness.activeMembers) }, { label: 'ADEUDADOS', value: formatOptionalNumber(sectorSummary?.fitness.totalDebtors) }, { label: 'MONTO ADEUDADOS', value: formatOptionalMoney(sectorSummary?.fitness.totalDebtAmount) }, { label: currentMonthProfitabilityLabel, value: formatSectorMoney('fitness.currentMonthProfitability', sectorSummary?.fitness.currentMonthProfitability), ...pendingMetricProps('fitness.currentMonthProfitability') }, { label: 'SALDO A LIQUIDAR', value: formatSectorMoney('fitness.settlementBalance', sectorSummary?.fitness.settlementBalance), ...pendingMetricProps('fitness.settlementBalance') }] },
      { key: 'local1', title: 'Local 1', moduleId: 'local1', subtitle: 'Ingresos relevantes', icon: '🏪', accent: 'local1', mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatSectorMoney('local1.totalProfitability', sectorSummary?.local1.totalProfitability), ...pendingMetricProps('local1.totalProfitability') }, secondaryMetrics: [{ label: 'TOTAL VENTAS', value: formatOptionalNumber(sectorSummary?.local1.totalRelevantIncomeMovements) }, { label: 'Últ. 30 días', value: formatOptionalNumber(sectorSummary?.local1.last30DaysRelevantIncomeMovements) }, { label: currentMonthProfitabilityLabel, value: formatSectorMoney('local1.currentMonthProfitability', sectorSummary?.local1.currentMonthProfitability), ...pendingMetricProps('local1.currentMonthProfitability') }, { label: 'SALDO A LIQUIDAR', value: formatSectorMoney('local1.settlementBalance', sectorSummary?.local1.settlementBalance), ...pendingMetricProps('local1.settlementBalance') }], featuredMetric: highlightedLocalIncome ? { label: 'Ingreso destacado', value: formatOptionalMoney(highlightedLocalIncome.amount), detail: `${highlightedLocalIncome.concept} · ${formatArDate(highlightedLocalIncome.date)}` } : { label: 'Ingreso destacado', value: '—' } },
      { key: 'salon', title: 'Salón', moduleId: 'salon', subtitle: 'Actividades EC', icon: '🎭', accent: 'salon', mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatSectorMoney('salon.totalProfitability', sectorSummary?.salon.totalProfitability), ...pendingMetricProps('salon.totalProfitability') }, secondaryMetrics: [{ label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.salon.totalMembers) }, { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.salon.activeMembers) }, { label: currentMonthProfitabilityLabel, value: formatSectorMoney('salon.currentMonthProfitability', sectorSummary?.salon.currentMonthProfitability), ...pendingMetricProps('salon.currentMonthProfitability') }, { label: 'MENOS POPULAR', value: formatActivityHighlight(sectorSummary?.salon.leastPopularActivity?.name, sectorSummary?.salon.leastPopularActivity?.members), className: 'area-card__metric--subtle-alert' }], featuredMetric: { label: 'MÁS POPULAR', value: formatActivityHighlight(sectorSummary?.salon.mostPopularActivity?.name, sectorSummary?.salon.mostPopularActivity?.members, true) } },
      { key: 'aula', title: 'Aula', moduleId: 'aula', subtitle: 'Talleres y comisiones', icon: '🎓', accent: 'aula', mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatSectorMoney('aula.totalProfitability', sectorSummary?.aula.totalProfitability), ...pendingMetricProps('aula.totalProfitability') }, secondaryMetrics: [{ label: 'INSCRIPTOS', value: formatOptionalNumber(sectorSummary?.aula.totalMembers) }, { label: 'ACTIVOS', value: formatOptionalNumber(sectorSummary?.aula.activeMembers) }, { label: currentMonthProfitabilityLabel, value: formatSectorMoney('aula.currentMonthProfitability', sectorSummary?.aula.currentMonthProfitability), ...pendingMetricProps('aula.currentMonthProfitability') }, { label: 'Comisión prom.', value: formatSectorPercent('aula.averageCommission', sectorSummary?.aula.averageCommission), ...pendingMetricProps('aula.averageCommission') }], featuredMetric: { label: 'MÁS POPULAR', value: formatActivityHighlight(sectorSummary?.aula.mostPopularActivity?.name, sectorSummary?.aula.mostPopularActivity?.members, true) } },
      { key: 'cantina', title: 'Cantina', moduleId: 'cantina', subtitle: 'Ventas y CMV', icon: '☕', accent: 'cantina', mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sectorSummary?.cantina.totalProfitability) }, secondaryMetrics: [{ label: 'KIOSCO', value: formatOptionalMoney(sectorSummary?.cantina.kioskIncome) }, { label: 'BEBIDAS', value: formatOptionalMoney(sectorSummary?.cantina.drinksIncome) }, { label: 'CMV', value: formatOptionalMoney(sectorSummary?.cantina.cmv) }] },
      { key: 'crm', title: 'CRM', moduleId: 'crm', subtitle: 'Inscriptos y cobranzas', icon: '💬', accent: 'crm', mainMetric: { label: 'Inscriptos', value: formatOptionalNumber(sectorSummary?.crm.totalMembers) }, secondaryMetrics: [{ label: 'Activos', value: formatOptionalNumber(sectorSummary?.crm.activeMembers) }, { label: 'Adeudados', value: formatOptionalNumber(sectorSummary?.crm.totalDebtors) }, { label: 'Monto adeudado', value: formatOptionalMoney(sectorSummary?.crm.totalDebtAmount) }] }
    ];
    return { loading, error, financeError, sectorError, syncStatus, syncBadgeLabel: syncLabel, lastSyncLabel: `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`, loadHome, enrollmentStats, weightedAverageFeeLabel: weightedAverageFee === undefined ? '—' : formatArPeso(weightedAverageFee), mainDebtorBreakdown, remainingDebtorActivities: Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0), totalDebtors: debtorBreakdown.reduce((total, item) => total + item.count, 0), maxDebtorActivityCount: mainDebtorBreakdown[0]?.count ?? 0, mainActiveActivityBreakdown, remainingActiveActivities: Math.max(activeActivityBreakdown.length - mainActiveActivityBreakdown.length, 0), maxActiveActivityCount: mainActiveActivityBreakdown[0]?.count ?? 0, financialSummaryLines, operationalBalanceLines, incomeBySectorLines, expenseBySectorLines, financeSummary, sectorCards };
  }, [debtors, error, financeError, financeSummary, loading, members, sectorError, sectorSummary, summary, syncStatus]);
}
