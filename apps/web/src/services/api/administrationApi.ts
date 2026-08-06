import type { AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationSectorsResponse, AdministrationSummaryResponse, EconomySectorRankings } from '@miclub/shared';
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
