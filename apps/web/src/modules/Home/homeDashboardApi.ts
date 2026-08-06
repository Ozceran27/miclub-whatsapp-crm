import { homeApi } from '../../services/api/homeApi';

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const settled = async <T>(promise: Promise<T>, fallback: string) => promise
  .then((value) => ({ value, error: null as string | null }))
  .catch((error: unknown) => ({ value: null, error: message(error, fallback) }));

/** Loads the home resources while keeping optional dashboard panels independently fallible. */
export const loadHomeDashboardResources = async (signal?: AbortSignal) => {
  const [summary, members, debtors, syncStatus, finance, sector] = await Promise.all([
    settled(homeApi.getSummary(signal), 'Resumen de membresías no disponible.'),
    settled(homeApi.getMembers(signal), 'Miembros no disponibles.'),
    settled(homeApi.getDebtors(signal), 'Deudores no disponibles.'),
    settled(homeApi.getSyncStatus(signal), 'Estado de sincronización no disponible.'),
    settled(homeApi.getFinanceSummary(signal), 'Resumen financiero no disponible.'),
    settled(homeApi.getSectorSummary(signal), 'Resumen operativo por sector no disponible.'),
  ]);
  return { summary, members, debtors, syncStatus, finance, sector };
};
