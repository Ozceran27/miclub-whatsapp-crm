import type { AdministrationSummaryResponse } from '@miclub/shared';
import { useCallback, useMemo } from 'react';
import { getAdministrationSummary } from '../../services/api/administrationApi';
import { useSession } from '../../session';
import { keys } from '../../serverState/queryKeys';
import { policies } from '../../serverState/policies';
import { useServerQuery } from '../../serverState/client';

type AdministrationSummaryError = { message: string };
export type AdministrationSummaryStatus = 'loading' | 'error' | 'empty' | 'ready';

const hasSummaryData = (summary: AdministrationSummaryResponse | null) => summary !== null;

export const administrationSummaryStatus = (summary: AdministrationSummaryResponse | null, loading: boolean, error: unknown): AdministrationSummaryStatus =>
  loading ? 'loading' : error ? 'error' : hasSummaryData(summary) ? 'ready' : 'empty';

export function useAdministrationSummary() {
  const { clubId } = useSession();
  const queryFn = useCallback(({signal}:{signal:AbortSignal}) => getAdministrationSummary(signal), []);
  const { data, loading, error: queryError, refetch } = useServerQuery({ key: keys.administrationSummary(clubId), queryFn, policy: policies.dashboard });
  const summary = data ?? null;
  const loadAdministrationSummary = useCallback(async () => { await refetch(); }, [refetch]);

  return useMemo(() => {
    const error: AdministrationSummaryError | null = queryError ? { message: queryError instanceof Error ? queryError.message : 'Error desconocido al cargar Administración.' } : null;
    const status = administrationSummaryStatus(summary, loading, error);
    return { summary, loading, error, status, loadAdministrationSummary };
  }, [queryError, loadAdministrationSummary, loading, summary]);
}
