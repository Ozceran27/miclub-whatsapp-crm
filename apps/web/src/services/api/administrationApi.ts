import type { AdministrationActivitiesResponse, AdministrationMovementsResponse, AdministrationSectorsResponse, AdministrationSummaryResponse } from '@miclub/shared';
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

export const getSectorActivities = (sectorId: string, signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>(`/api/actividades?page=1&limit=100&sectorId=${encodeURIComponent(sectorId)}`, { cache: 'no-store', signal });

export const getSectorMovements = (sectorId: string, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(`/api/movimientos?page=1&limit=20&sectorId=${encodeURIComponent(sectorId)}`, { cache: 'no-store', signal });
