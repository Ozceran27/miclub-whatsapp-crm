import type { AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationSectorsResponse, AdministrationSummaryResponse, AdministrationWorkerMutationDto, AdministrationWorkersResponse, EconomySectorRankings } from '@miclub/shared';
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

export type SectorTemplate = { id: string; code: string; display_name: string; icon_key: string; display_order: number };
export const getSectorTemplates = (signal?: AbortSignal) => apiJson<{items: SectorTemplate[]}>('/api/administration/sector-templates', { signal });
export const createAdministrationSector = (input: {templateId:string;color:string;status:'active'|'inactive'|'under_repair'}) =>
  apiJson<Record<string,unknown>>('/api/administration/sectors', { method: 'POST', body: JSON.stringify(input) });

export const getAdministrationActivities = (signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100', { cache: 'no-store', signal });

export const getAdministrationWorkers = (signal?: AbortSignal) =>
  apiJson<AdministrationWorkersResponse>('/api/administration/workers?page=1&limit=100', { cache: 'no-store', signal });
export const createAdministrationWorker = (input: AdministrationWorkerMutationDto) => apiJson('/api/administration/workers', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationWorker = (id: string, input: AdministrationWorkerMutationDto) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'PUT', body: JSON.stringify(input) });
export const archiveAdministrationWorker = (id: string) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'DELETE' });

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

const paginatedUrl = (path: `/${string}`, page: number, filters: AdministrationListFilters): `/${string}` => {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value?.trim()) query.set(key, value.trim());
  });
  return `${path}?${query.toString()}` as `/${string}`;
};

export const getAdministrationMovements = (page: number, filters: AdministrationListFilters, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(paginatedUrl('/api/movimientos', page, filters), { cache: 'no-store', signal });

export const getAdministrationEnrollments = (page: number, filters: AdministrationListFilters, signal?: AbortSignal) =>
  apiJson<AdministrationEnrollmentsResponse>(paginatedUrl('/api/inscripciones', page, filters), { cache: 'no-store', signal });

export type MovementCatalogItem = { id: string; code?: string; name: string; displayName?: string; classification?: 'OPERATIONAL'|'NON_OPERATIONAL'|'TAX'|'SERVICE'|'LIABILITY'; displayOrder?: number; sectorId?: string; direction?: 'INGRESOS'|'EGRESOS'; isActive?: boolean };
export const getMovementFormCatalogs = async (signal?: AbortSignal) => {
  const [categories,sectors,activities,paymentMethods]=await Promise.all([
    apiJson<MovementCatalogItem[]>('/api/movement-categories',{signal}), apiJson<MovementCatalogItem[]>('/api/sectors',{signal}),
    apiJson<MovementCatalogItem[]>('/api/activities',{signal}), apiJson<MovementCatalogItem[]>('/api/payment-methods',{signal})
  ]); return {categories,sectors,activities,paymentMethods};
};
export const createAdministrationMovement = (input: Record<string,unknown>, idempotencyKey: string) =>
  apiJson<Record<string,unknown>>('/api/movements',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify(input)});

export type EnrollmentCatalogItem={id:string;name:string;status?:string;generatesEnrollments?:boolean};
export const getEnrollmentFormCatalogs=async(signal?:AbortSignal)=>{const [peopleResponse,activitiesResponse]=await Promise.all([
  apiJson<{items:Array<{id:string;firstName?:string;lastName?:string;dni?:string}>}>('/api/people?limit=200',{signal}),
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100',{signal})
]);
 return {people:peopleResponse.items.map(person=>({id:person.id,name:`${person.firstName??''} ${person.lastName??''}`.trim()+(person.dni?` · DNI ${person.dni}`:'')})),activities:activitiesResponse.items.map(activity=>({id:activity.id,name:activity.name,status:activity.status,generatesEnrollments:activity.generatesEnrollments}))};
};
export const createAdministrationEnrollment=(input:Record<string,unknown>)=>apiJson<Record<string,unknown>>('/api/inscripciones',{method:'POST',body:JSON.stringify(input)});
