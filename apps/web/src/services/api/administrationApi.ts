import type { AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationSectorsResponse, AdministrationSummaryResponse, AdministrationWorkersResponse, EconomySectorRankings } from '@miclub/shared';
import { apiJson } from '../../api';

export const administrationEndpoints = {
  summary: '/api/administration/summary'
} as const;

export const getAdministrationResource = <T>(key: keyof typeof administrationEndpoints, signal?: AbortSignal) =>
  apiJson<T>(administrationEndpoints[key], { cache: 'no-store', signal });

export const getAdministrationSummary = (signal?: AbortSignal) =>
  getAdministrationResource<AdministrationSummaryResponse>('summary', signal);

export const getAdministrationSectors = (signal?: AbortSignal) =>
  apiJson<AdministrationSectorsResponse>('/api/sectores?page=1&limit=100', { cache: 'no-store', signal });

export const getAdministrationActivities = (signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100', { cache: 'no-store', signal });

export const getAdministrationWorkers = (signal?: AbortSignal) =>
  apiJson<AdministrationWorkersResponse>('/api/administration/workers?page=1&limit=100', { cache: 'no-store', signal });

export const getAnnualActivityRanking = (signal?: AbortSignal) =>
  apiJson<EconomySectorRankings>('/api/economy/activity-rankings?limit=100', { cache: 'no-store', signal });

export const getSectorActivities = (sectorId: string, signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>(`/api/actividades?page=1&limit=100&sectorId=${encodeURIComponent(sectorId)}`, { cache: 'no-store', signal });

export const getSectorMovements = (sectorId: string, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(`/api/movimientos?page=1&limit=20&sectorId=${encodeURIComponent(sectorId)}`, { cache: 'no-store', signal });

export const getActivityEnrollments = (activityId: string, signal?: AbortSignal) =>
  apiJson<AdministrationEnrollmentsResponse>(`/api/inscripciones?page=1&limit=100&activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store', signal });

export const getActivityMovements = (activityId: string, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(`/api/movimientos?page=1&limit=100&activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store', signal });

type AdministrationListFilters = Record<string, string | undefined>;

const paginatedUrl = (path: string, page: number, filters: AdministrationListFilters) => {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value?.trim()) query.set(key, value.trim());
  });
  return `${path}?${query.toString()}`;
};

export const getAdministrationMovements = (page: number, filters: AdministrationListFilters, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(paginatedUrl('/api/movimientos', page, filters), { cache: 'no-store', signal });

export const getAdministrationEnrollments = (page: number, filters: AdministrationListFilters, signal?: AbortSignal) =>
  apiJson<AdministrationEnrollmentsResponse>(paginatedUrl('/api/inscripciones', page, filters), { cache: 'no-store', signal });
