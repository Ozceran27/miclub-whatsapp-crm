import type { AdministrationSummaryResponse } from '@miclub/shared';
import { apiJson } from '../../api';

export const administrationEndpoints = {
  summary: '/api/administration/summary'
} as const;

export const getAdministrationResource = <T>(key: keyof typeof administrationEndpoints, signal?: AbortSignal) =>
  apiJson<T>(administrationEndpoints[key], { cache: 'no-store', signal });

export const getAdministrationSummary = (signal?: AbortSignal) =>
  getAdministrationResource<AdministrationSummaryResponse>('summary', signal);
