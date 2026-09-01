import { useEffect, useMemo, useState } from 'react';
import type { ClubOperationsSummary, Member, SectorOperationalSummary, StatusBreakdown as ApiStatusBreakdown } from '@miclub/shared';
import { loadHomeDashboardResources } from './homeDashboardApi';
import { buildActivityBreakdown, calculateWeightedAverageFee, formatDateTime, getCurrentSpanishMonthUpper, getEnrollmentStatusBreakdown, isActiveMember, isDebtor, isFiniteNumber, mapSummaryStatusBreakdown } from './homeDashboardPresentation';
import { formatArPeso } from '../../utils';
import type { ModuleId } from '../ModuleNav';
import { getSectorVisualMeta } from '../sectorVisualMeta';

export type SyncStatus = {
  source: 'postgres';
  enabled: boolean;
  sheets: string[];
  lastSyncAt?: string;
  error?: string;
};

export type Summary = {
  totalMembers: number;
  totalDebtors: number;
  totalEstimatedDebt: number;
  debtorsWithoutPayments?: number;
  totalBySheet?: Record<string, number>;
  debtorsBySheet?: Record<string, number>;
  statusBreakdown?: ApiStatusBreakdown;
  rawStatusBreakdown?: Record<string, number>;
};

export type ActivityBreakdownItem = {
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
  accent: 'default';
  color?: string;
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
      const payload = await loadHomeDashboardResources();
      if (payload.summary.value) setSummary(payload.summary.value);
      if (payload.members.value) setMembers(payload.members.value);
      if (payload.debtors.value) setDebtors(payload.debtors.value);
      if (payload.syncStatus.value) setSyncStatus(payload.syncStatus.value);
      setFinanceSummary(payload.finance.value); setFinanceError(payload.finance.error);
      setSectorSummary(payload.sector.value); setSectorError(payload.sector.error);
      const coreErrors = [payload.summary.error, payload.members.error, payload.debtors.error, payload.syncStatus.error].filter(Boolean);
      setError(coreErrors.length ? `Algunas secciones no se pudieron actualizar: ${coreErrors.join(' · ')}` : null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error desconocido al cargar el inicio.'); } finally { setLoading(false); }
  };

  useEffect(() => { void loadHome(); }, []);
  useEffect(()=>{const refresh=()=>void loadHome();window.addEventListener('miclub:movement-created',refresh);return()=>window.removeEventListener('miclub:movement-created',refresh)},[]);

  return useMemo(() => {
    const syncLabel = !syncStatus ? 'No disponible' : syncStatus.error ? 'Con advertencias' : 'PostgreSQL conectado';
    const enrollmentStats = mapSummaryStatusBreakdown(summary?.statusBreakdown) ?? getEnrollmentStatusBreakdown(members, summary?.totalMembers);
    const debtorRecords = members.length > 0 ? members : debtors;
    const debtorBreakdown = buildActivityBreakdown(debtorRecords.filter(isDebtor));
    const mainDebtorBreakdown = debtorBreakdown.slice(0, 3);
    const activeActivityBreakdown = buildActivityBreakdown(members.filter(isActiveMember));
    const mainActiveActivityBreakdown = activeActivityBreakdown.slice(0, 6);
    const weightedAverageFee = calculateWeightedAverageFee(members);
    const unavailableLabel = financeError ? 'No disponible' : '—';
    const estimatedDebt = financeSummary?.cuotasACobrar ?? financeSummary?.cuotasAdeudadas ?? summary?.totalEstimatedDebt;
    const formatFinanceMoney = (value: number | undefined) => financeSummary && isFiniteNumber(value) ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: financeSummary.presentationCurrencyCode }).format(value) : unavailableLabel;
    const formatUsd = (value: number | undefined) => financeSummary && isFiniteNumber(value) ? `USD ${Math.round(value).toLocaleString('es-AR')}` : unavailableLabel;
    const conversionDetail = financeSummary?.appliedRate ? ` → ${formatFinanceMoney(financeSummary.dollarsConverted)} (tasa ${financeSummary.appliedRate}, ${financeSummary.rateDate}, ${financeSummary.rateSource})` : '';
    const incompleteValuation = financeSummary?.valuationStatus === 'INCOMPLETE_EXCHANGE_RATE';
    const blockedTotal = incompleteValuation ? 'No disponible' : formatFinanceMoney(financeSummary?.liquidity);
    const financialSummaryLines: FinancialLine[] = [{ label: 'Liquidez', value: blockedTotal, highlight: incompleteValuation ? 'negativeCritical' : 'positiveCritical', iconBefore: '💰' }, { label: 'Caja', value: formatFinanceMoney(financeSummary?.cash) }, { label: 'Banco', value: formatFinanceMoney(financeSummary?.bank) }, { label: 'Dólares', value: `${formatUsd(financeSummary?.dollars)}${conversionDetail}` }];
    const operationalBalanceLines: FinancialLine[] = [{ label: 'Cuotas a cobrar', value: isFiniteNumber(estimatedDebt) ? formatFinanceMoney(estimatedDebt) : unavailableLabel }, { label: 'Saldos a Liquidar', value: formatFinanceMoney(financeSummary?.settlementBalance ?? financeSummary?.saldosAPagar) }, { label: 'Saldos Pendientes', value: formatFinanceMoney(financeSummary?.pendingNetBalance) }, { label: 'Saldo proyectado', value: incompleteValuation ? 'No disponible' : formatFinanceMoney(financeSummary?.projectedBalance), highlight: incompleteValuation ? 'negativeCritical' : 'positiveCritical', iconBefore: '📈' }];
    const incomeBySectorLines: FinancialLine[] = financeSummary?.incomeBySector.length ? financeSummary.incomeBySector.map((item, index) => ({ id: `income-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'positiveCritical' : undefined, iconAfter: index === 0 ? '⭐' : undefined })) : [{ id: 'income-unavailable', label: 'Ingresos', value: unavailableLabel }];
    const expenseBySectorLines: FinancialLine[] = financeSummary?.expenseBySector.length ? financeSummary.expenseBySector.map((item, index) => ({ id: `expense-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'negativeCritical' : undefined, iconAfter: index === 0 ? '🔻' : undefined })) : [{ id: 'expense-unavailable', label: 'Egresos', value: unavailableLabel }];
    const formatOptionalNumber = (value: number | null | undefined) => isFiniteNumber(value) ? value.toLocaleString('es-AR') : '—';
    const formatOptionalMoney = (value: number | null | undefined) => isFiniteNumber(value) ? formatArPeso(value) : '—';
    const currentMonthProfitabilityLabel = `RENTABILIDAD ${getCurrentSpanishMonthUpper()}`;
    const sectorCards: SectorCardConfig[] = (sectorSummary?.sectors ?? []).map((sector) => {
      const visual = getSectorVisualMeta(sector);
      return {
        key: sector.id,
        title: sector.name,
        moduleId: 'administration',
        subtitle: sector.code,
        icon: visual.icon,
        accent: visual.accent,
        color: visual.color,
        mainMetric: { label: 'RENTABILIDAD TOTAL', value: formatOptionalMoney(sector.totalProfitability) },
        secondaryMetrics: [
          { label: 'INSCRIPTOS', value: formatOptionalNumber(sector.totalMembers) },
          { label: 'ACTIVOS', value: formatOptionalNumber(sector.activeMembers) },
          { label: 'ADEUDADOS', value: formatOptionalNumber(sector.totalDebtors) },
          { label: 'MONTO ADEUDADO', value: formatOptionalMoney(sector.totalDebtAmount) },
          { label: currentMonthProfitabilityLabel, value: formatOptionalMoney(sector.currentMonthProfitability) },
          { label: 'SALDO A LIQUIDAR', value: formatOptionalMoney(sector.settlementBalance) },
        ],
        ...(sector.mostPopularActivity ? { featuredMetric: { label: 'MÁS POPULAR', value: `${sector.mostPopularActivity.name} · ${formatOptionalNumber(sector.mostPopularActivity.members)}` } } : {}),
      };
    });
    return { loading, error, financeError, sectorError, syncStatus, syncBadgeLabel: syncLabel, lastSyncLabel: `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`, loadHome, enrollmentStats, weightedAverageFeeLabel: weightedAverageFee === undefined ? '—' : formatArPeso(weightedAverageFee), mainDebtorBreakdown, remainingDebtorActivities: Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0), totalDebtors: debtorBreakdown.reduce((total, item) => total + item.count, 0), maxDebtorActivityCount: mainDebtorBreakdown[0]?.count ?? 0, mainActiveActivityBreakdown, remainingActiveActivities: Math.max(activeActivityBreakdown.length - mainActiveActivityBreakdown.length, 0), maxActiveActivityCount: mainActiveActivityBreakdown[0]?.count ?? 0, financialSummaryLines, operationalBalanceLines, incomeBySectorLines, expenseBySectorLines, financeSummary, sectorCards };
  }, [debtors, error, financeError, financeSummary, loading, members, sectorError, sectorSummary, summary, syncStatus]);
}
