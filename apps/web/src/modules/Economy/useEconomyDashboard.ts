import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../api';
import type { DashboardStatus, EconomyAnnualSummary, EconomyCategoryBreakdownItem, EconomyDashboardCollection, EconomyDashboardError, EconomyInsight, EconomyMonthlyEvolutionItem, EconomyPaymentMethodItem, EconomyPendingSummary, EconomyRecentMovement, EconomySectorBreakdownItem, EconomySummary } from './types';

type EconomyDashboardData = {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  paymentMethods: EconomyDashboardCollection<EconomyPaymentMethodItem>;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
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
  insights: '/api/economy/insights'
};

const fetchEconomyResource = async <K extends keyof EconomyEndpointMap>(key: K): Promise<EconomyEndpointMap[K]> => {
  const response = await fetch(apiUrl(endpoints[key]), { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar el tablero de economía.');
  return response.json() as Promise<EconomyEndpointMap[K]>;
};

export function useEconomyDashboard() {
  const [data, setData] = useState<EconomyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EconomyDashboardError | null>(null);

  const loadEconomyDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, monthlyEvolution, bySector, byCategory, paymentMethods, recentMovements, pending, annualSummary, insights] = await Promise.all([
        fetchEconomyResource('summary'),
        fetchEconomyResource('monthlyEvolution'),
        fetchEconomyResource('bySector'),
        fetchEconomyResource('byCategory'),
        fetchEconomyResource('paymentMethods'),
        fetchEconomyResource('recentMovements'),
        fetchEconomyResource('pending'),
        fetchEconomyResource('annualSummary'),
        fetchEconomyResource('insights')
      ]);
      setData({ summary, monthlyEvolution, bySector, byCategory, paymentMethods, recentMovements, pending, annualSummary, insights });
    } catch (loadError) {
      setError({ message: loadError instanceof Error ? loadError.message : 'Error desconocido al cargar economía.' });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEconomyDashboard(); }, [loadEconomyDashboard]);

  return useMemo(() => {
    const isEmpty = !loading && !error && Boolean(data) && data?.summary.totalMovements === 0 && data?.recentMovements.total === 0 && data?.pending.total === 0;
    const status: DashboardStatus = loading ? 'loading' : error ? 'error' : isEmpty ? 'empty' : 'ready';
    return { data, loading, error, isEmpty, status, loadEconomyDashboard };
  }, [data, error, loading, loadEconomyDashboard]);
}

export type EconomyDashboardState = ReturnType<typeof useEconomyDashboard>;
