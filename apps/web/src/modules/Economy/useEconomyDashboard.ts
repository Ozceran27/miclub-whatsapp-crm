import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../api';
import type { DashboardStatus, EconomyAnnualSummary, EconomyCategoryBreakdownItem, EconomyComparison, EconomyDashboardCollection, EconomyDashboardError, EconomyInsight, EconomyMonthlyEvolutionItem, EconomyPaymentMethodItem, EconomyPendingSummary, EconomyRecentMovement, EconomySectorBreakdownItem, EconomySummary } from './types';

type EconomyDashboardData = {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  paymentMethods: EconomyDashboardCollection<EconomyPaymentMethodItem>;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
  comparison: EconomyComparison;
  insights: EconomyDashboardCollection<EconomyInsight>;
};

type EconomyEndpointMap = {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  paymentMethods: EconomyDashboardCollection<EconomyPaymentMethodItem>;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
  comparison: EconomyComparison;
  insights: EconomyDashboardCollection<EconomyInsight>;
};

const endpoints: { [K in keyof EconomyEndpointMap]: `/${string}` } = {
  summary: '/api/economy/summary',
  monthlyEvolution: '/api/economy/monthly-evolution',
  bySector: '/api/economy/by-sector?limit=6',
  byCategory: '/api/economy/by-category?limit=6',
  paymentMethods: '/api/economy/payment-methods',
  recentMovements: '/api/economy/recent-movements?limit=8',
  pending: '/api/economy/pending?limit=8',
  annualSummary: '/api/economy/annual-summary',
  comparison: '/api/economy/comparison',
  insights: '/api/economy/insights'
};

const fetchEconomyResource = async <K extends keyof EconomyEndpointMap>(key: K, signal?: AbortSignal): Promise<EconomyEndpointMap[K]> => {
  const response = await fetch(apiUrl(endpoints[key]), { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`No se pudo cargar ${endpoints[key]}.`);
  return response.json() as Promise<EconomyEndpointMap[K]>;
};

export function useEconomyDashboard() {
  const [data, setData] = useState<EconomyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EconomyDashboardError | null>(null);

  const loadEconomyDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, monthlyEvolution, bySector, byCategory, paymentMethods, recentMovements, pending, annualSummary, comparison, insights] = await Promise.all([
        fetchEconomyResource('summary', signal),
        fetchEconomyResource('monthlyEvolution', signal),
        fetchEconomyResource('bySector', signal),
        fetchEconomyResource('byCategory', signal),
        fetchEconomyResource('paymentMethods', signal),
        fetchEconomyResource('recentMovements', signal),
        fetchEconomyResource('pending', signal),
        fetchEconomyResource('annualSummary', signal),
        fetchEconomyResource('comparison', signal),
        fetchEconomyResource('insights', signal)
      ]);
      setData({ summary, monthlyEvolution, bySector, byCategory, paymentMethods, recentMovements, pending, annualSummary, comparison, insights });
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

  return useMemo(() => {
    const isEmpty = !loading && !error && Boolean(data) && data?.summary.totalMovements === 0 && data?.recentMovements.total === 0 && data?.pending.total === 0;
    const status: DashboardStatus = loading ? 'loading' : error ? 'error' : isEmpty ? 'empty' : 'ready';
    return { data, loading, error, isEmpty, status, loadEconomyDashboard };
  }, [data, error, loading, loadEconomyDashboard]);
}

export type EconomyDashboardState = ReturnType<typeof useEconomyDashboard>;
