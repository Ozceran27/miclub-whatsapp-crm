import type { AdministrationSummaryResponse } from '@miclub/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdministrationSummary } from '../../services/api/administrationApi';

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
  const [summary, setSummary] = useState<AdministrationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdministrationSummaryError | null>(null);

  const loadAdministrationSummary = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getAdministrationSummary(signal));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError({ message: loadError instanceof Error ? loadError.message : 'Error desconocido al cargar Administración.' });
      setSummary(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAdministrationSummary(controller.signal);
    return () => controller.abort();
  }, [loadAdministrationSummary]);

  return useMemo(() => {
    const status: AdministrationSummaryStatus = loading ? 'loading' : error ? 'error' : hasSummaryData(summary) ? 'ready' : 'empty';
    return { summary, loading, error, status, loadAdministrationSummary };
  }, [error, loadAdministrationSummary, loading, summary]);
}
