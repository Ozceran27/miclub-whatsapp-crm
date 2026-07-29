import { homeApi } from '../../services/api/homeApi';

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

/** Loads the home resources while keeping optional dashboard panels independently fallible. */
export const loadHomeDashboardResources = async () => {
  const financePromise = homeApi.getFinanceSummary()
    .then((value) => ({ value, error: null as string | null }))
    .catch((error: unknown) => ({ value: null, error: message(error, 'Resumen financiero no disponible.') }));
  const sectorPromise = homeApi.getSectorSummary()
    .then((value) => ({ value, error: null as string | null }))
    .catch((error: unknown) => ({ value: null, error: message(error, 'Resumen operativo por sector no disponible.') }));

  const [summary, members, debtors, syncStatus, finance, sector] = await Promise.all([
    homeApi.getSummary(), homeApi.getMembers(), homeApi.getDebtors(), homeApi.getSyncStatus(), financePromise, sectorPromise,
  ]);
  return { summary, members, debtors, syncStatus, finance, sector };
};
