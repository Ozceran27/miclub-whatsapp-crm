import { useCallback } from 'react';
import { useSession } from '../../session';
import { useServerQuery } from '../../serverState/client';
import { queryKey } from '../../serverState/queryKeys';
import { policies } from '../../serverState/policies';
import { getEconomyResource } from '../../services/api/economyApi';
import type { EconomyAnnualSummary, EconomyCategoryBreakdownItem, EconomyComparison, EconomyDashboardCollection, EconomyInsight, EconomyMonthlyEvolutionItem, EconomyPaymentMethodsSummary, EconomyPendingSummary, EconomyRecentMovement, EconomySectorBreakdownItem, EconomySectorRankings, EconomySummary, EconomyYearlyBreakdown } from './types';

type Resource<T> = { data?: T; error?: unknown; loading: boolean; refetch: () => Promise<T> };
type ResourceName = Parameters<typeof getEconomyResource>[0];

function useEconomyResource<T>(clubId: string | null, name: ResourceName, year?: number): Resource<T> {
  const fetch = useCallback(({ signal }: { signal: AbortSignal }) => getEconomyResource<T>(name, signal, year), [name, year]);
  return useServerQuery({ key: queryKey({ clubId, resource: `economy-${name}`, filters: year ? { year } : undefined }), queryFn: fetch, policy: policies.dashboard });
}

export function useEconomyDashboard(year: number) {
  const { clubId } = useSession();
  const sections = {
    summary: useEconomyResource<EconomySummary>(clubId, 'summary'),
    availableYears: useEconomyResource<EconomyDashboardCollection<number>>(clubId, 'availableYears'),
    monthlyEvolution: useEconomyResource<EconomyDashboardCollection<EconomyMonthlyEvolutionItem>>(clubId, 'monthlyEvolution', year),
    bySector: useEconomyResource<EconomyDashboardCollection<EconomySectorBreakdownItem>>(clubId, 'bySector'),
    byCategory: useEconomyResource<EconomyDashboardCollection<EconomyCategoryBreakdownItem>>(clubId, 'byCategory'),
    sectorRankings: useEconomyResource<EconomySectorRankings>(clubId, 'sectorRankings'),
    paymentMethods: useEconomyResource<EconomyPaymentMethodsSummary>(clubId, 'paymentMethods'),
    recentMovements: useEconomyResource<EconomyDashboardCollection<EconomyRecentMovement>>(clubId, 'recentMovements'),
    pending: useEconomyResource<EconomyPendingSummary>(clubId, 'pending'),
    annualSummary: useEconomyResource<EconomyAnnualSummary>(clubId, 'annualSummary', year),
    comparison: useEconomyResource<EconomyComparison>(clubId, 'comparison'),
    insights: useEconomyResource<EconomyDashboardCollection<EconomyInsight>>(clubId, 'insights'),
    yearlyBreakdown: useEconomyResource<EconomyYearlyBreakdown>(clubId, 'yearlyBreakdown', year),
  };
  const loadEconomyDashboard = () => { void Promise.allSettled(Object.values(sections).map(section => section.refetch())); };
  const isEmpty = sections.summary.data?.totalMovements === 0 && sections.recentMovements.data?.total === 0 && sections.pending.data?.total === 0;
  return { sections, loading: sections.summary.loading, isEmpty, loadEconomyDashboard };
}

export type EconomyDashboardState = ReturnType<typeof useEconomyDashboard>;
