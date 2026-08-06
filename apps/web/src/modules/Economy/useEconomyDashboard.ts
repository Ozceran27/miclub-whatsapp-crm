import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEconomyResource } from '../../services/api/economyApi';
import type { DashboardStatus, EconomyAnnualSummary, EconomyCategoryBreakdownItem, EconomyComparison, EconomyDashboardCollection, EconomyDashboardError, EconomyInsight, EconomyMonthlyEvolutionItem, EconomyPaymentMethodsSummary, EconomyPendingSummary, EconomyRecentMovement, EconomySectorBreakdownItem, EconomySectorRankings, EconomySummary, EconomyYearlyBreakdown } from './types';

type EconomyDashboardData = {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  sectorRankings: EconomySectorRankings;
  paymentMethods: EconomyPaymentMethodsSummary;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
  comparison: EconomyComparison;
  insights: EconomyDashboardCollection<EconomyInsight>;
  yearlyBreakdown: EconomyYearlyBreakdown;
};

type EconomyEndpointMap = {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  sectorRankings: EconomySectorRankings;
  paymentMethods: EconomyPaymentMethodsSummary;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
  comparison: EconomyComparison;
  insights: EconomyDashboardCollection<EconomyInsight>;
  yearlyBreakdown: EconomyYearlyBreakdown;
};

const fetchEconomyResource = async <K extends keyof EconomyEndpointMap>(key: K, signal?: AbortSignal): Promise<EconomyEndpointMap[K]> => {
  return getEconomyResource<EconomyEndpointMap[K]>(key, signal);
};

export function useEconomyDashboard() {
  const [data, setData] = useState<EconomyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EconomyDashboardError | null>(null);

  const loadEconomyDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, monthlyEvolution, bySector, byCategory, sectorRankings, paymentMethods, recentMovements, pending, annualSummary, comparison, insights, yearlyBreakdown] = await Promise.all([
        fetchEconomyResource('summary', signal),
        fetchEconomyResource('monthlyEvolution', signal),
        fetchEconomyResource('bySector', signal),
        fetchEconomyResource('byCategory', signal),
        fetchEconomyResource('sectorRankings', signal),
        fetchEconomyResource('paymentMethods', signal),
        fetchEconomyResource('recentMovements', signal),
        fetchEconomyResource('pending', signal),
        fetchEconomyResource('annualSummary', signal),
        fetchEconomyResource('comparison', signal),
        fetchEconomyResource('insights', signal),
        fetchEconomyResource('yearlyBreakdown', signal)
      ]);
      setData({ summary, monthlyEvolution, bySector, byCategory, sectorRankings, paymentMethods, recentMovements, pending, annualSummary, comparison, insights, yearlyBreakdown });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError({ message: loadError instanceof Error ? loadError.message : 'Error desconocido al cargar economía.' });
      setData(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadEconomyDashboard(controller.signal);
    return () => controller.abort();
  }, [loadEconomyDashboard]);
  useEffect(()=>{const refresh=()=>void loadEconomyDashboard();window.addEventListener('miclub:movement-created',refresh);return()=>window.removeEventListener('miclub:movement-created',refresh)},[loadEconomyDashboard]);

  return useMemo(() => {
    const isEmpty = !loading && !error && Boolean(data) && data?.summary.totalMovements === 0 && data?.recentMovements.total === 0 && data?.pending.total === 0;
    const status: DashboardStatus = loading ? 'loading' : error ? 'error' : isEmpty ? 'empty' : 'ready';
    return { data, loading, error, isEmpty, status, loadEconomyDashboard };
  }, [data, error, loading, loadEconomyDashboard]);
}

export type EconomyDashboardState = ReturnType<typeof useEconomyDashboard>;
