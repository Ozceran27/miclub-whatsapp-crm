import type { AdministrationSummaryResponse } from '@miclub/shared';
import { useCallback, useMemo } from 'react';
import { getAdministrationSummary } from '../../services/api/administrationApi';
import { useSession } from '../../session';
import { keys } from '../../serverState/queryKeys';
import { policies } from '../../serverState/policies';
import { useServerQuery } from '../../serverState/client';

type AdministrationSummaryError = { message: string };
export type AdministrationSummaryStatus = 'loading' | 'error' | 'empty' | 'ready';

const hasKnownNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const hasSummaryData = (summary: AdministrationSummaryResponse | null) => {
  if (!summary) return false;
  const values = [
    summary.totals?.enrollments?.value,
    summary.capacity?.totalCapacity,
    summary.capacity?.occupied,
    summary.totals?.workers?.value,
    summary.totals?.activities?.value,
    summary.rankings?.activitiesByEnrollments?.length,
    summary.trends?.points?.length
  ];
  return values.some((value) => hasKnownNumber(value) ? value > 0 : Boolean(value));
};

export function useAdministrationSummary() {
  const { clubId } = useSession();
  const queryFn = useCallback(({signal}:{signal:AbortSignal}) => getAdministrationSummary(signal), []);
  const query = useServerQuery({ key: keys.administrationSummary(clubId), queryFn, policy: policies.dashboard });
  const summary = query.data ?? null;
  const loading = query.loading;
  const error: AdministrationSummaryError | null = query.error ? { message: query.error instanceof Error ? query.error.message : 'Error desconocido al cargar Administración.' } : null;
  const loadAdministrationSummary = useCallback(async () => { await query.refetch(); }, [query.refetch]);

  return useMemo(() => {
    const status: AdministrationSummaryStatus = loading ? 'loading' : error ? 'error' : hasSummaryData(summary) ? 'ready' : 'empty';
    return { summary, loading, error, status, loadAdministrationSummary };
  }, [error, loadAdministrationSummary, loading, summary]);
}
