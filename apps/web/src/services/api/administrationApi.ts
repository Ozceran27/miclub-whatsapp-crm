import type { ActivityMutationContract, AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationSectorCreateDto, AdministrationSectorUpdateDto, AdministrationSectorsResponse, AdministrationSummaryResponse, AdministrationWorkerMutationDto, AdministrationWorkersResponse, EconomySectorRankings } from '@miclub/shared';
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

export const createAdministrationSector = (input: AdministrationSectorCreateDto) =>
  apiJson<Record<string,unknown>>('/api/administration/sectors', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationSector = (id:string,input:AdministrationSectorUpdateDto) => apiJson(`/api/sectors/${encodeURIComponent(id)}` as `/${string}`,{method:'PATCH',body:JSON.stringify(input)});
export const changeAdministrationSectorStatus = (id:string,updatedAt:string,status:'active'|'inactive'|'under_repair') => apiJson(`/api/sectors/${encodeURIComponent(id)}/status` as `/${string}`,{method:'PATCH',body:JSON.stringify({updatedAt,status})});
export const archiveAdministrationSector = (id:string,updatedAt:string) => apiJson(`/api/sectors/${encodeURIComponent(id)}/archive` as `/${string}`,{method:'POST',body:JSON.stringify({updatedAt})});

export const getAdministrationActivities = (signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100', { cache: 'no-store', signal });

export type ActivityInstructorCatalogItem = { id: string; personId: string; displayName: string; isActive: boolean };
export type ActivityTermHistoryItem = { id:string; mode:'FIXED'|'VARIABLE'; fixedClubFee:number|null; fixedFeeFrequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'|null; clubSharePercentage:number|null; currencyCode:string|null; effectiveFrom:string; effectiveTo:string|null; responsiblePersonId:string|null; responsiblePersonName:string|null; revision:number };
export type AdministrationActivityMutation = ActivityMutationContract;
export type AdministrationActivityMutationResponse = { id: string; updatedAt: string } & Record<string, unknown>;

export const getActivityFormCatalogs = async (signal?: AbortSignal) => {
  const [sectors, instructors, workers] = await Promise.all([
    getAdministrationSectors(signal),
    apiJson<{ items: Array<{ id: string; personId: string; displayName?: string; name?: string; isActive?: boolean; status?: string }> }>('/api/administration/activity-instructors', { cache: 'no-store', signal }),
    getAdministrationWorkers(signal),
  ]);
  return {
    sectors: sectors.items.filter((sector) => sector.status === 'active'),
    instructors: instructors.items
      .filter((instructor) => instructor.isActive !== false && instructor.status !== 'inactive')
      .map((instructor) => ({ id: instructor.id, personId: instructor.personId, displayName: instructor.displayName ?? instructor.name ?? 'Instructor sin nombre', isActive: true })),
    responsibles: workers.items.filter(worker=>worker.isActive && worker.personId).map(worker=>({id:worker.personId!,name:worker.displayName})),
  };
};

export const createAdministrationActivity = (input: AdministrationActivityMutation) =>
  apiJson<AdministrationActivityMutationResponse>('/api/activities', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationActivity = (id: string, updatedAt: string, input: AdministrationActivityMutation) =>
  apiJson<AdministrationActivityMutationResponse>(`/api/activities/${encodeURIComponent(id)}` as `/${string}`, { method: 'PATCH', body: JSON.stringify({ ...input, updatedAt }) });
export const changeAdministrationActivityStatus = (id: string, updatedAt: string, status: 'active' | 'inactive') =>
  apiJson<AdministrationActivityMutationResponse>(`/api/activities/${encodeURIComponent(id)}/status` as `/${string}`, { method: 'PATCH', body: JSON.stringify({ updatedAt, status }) });
export const archiveAdministrationActivity = (id: string, updatedAt: string) =>
  apiJson<AdministrationActivityMutationResponse>(`/api/activities/${encodeURIComponent(id)}/archive` as `/${string}`, { method: 'POST', body: JSON.stringify({ updatedAt }) });

export const getAdministrationWorkers = (signal?: AbortSignal) =>
  apiJson<AdministrationWorkersResponse>('/api/administration/workers?page=1&limit=100', { cache: 'no-store', signal });
export const createAdministrationWorker = (input: AdministrationWorkerMutationDto) => apiJson('/api/administration/workers', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationWorker = (id: string, input: AdministrationWorkerMutationDto) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'PUT', body: JSON.stringify(input) });
export const deleteAdministrationWorkerPhoto = (id: string) => apiJson<{deleted:boolean}>(`/api/administration/workers/${encodeURIComponent(id)}/photo` as `/${string}`, { method: 'DELETE' });
export const archiveAdministrationWorker = (id: string) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'DELETE' });

export const getAnnualActivityRanking = (signal?: AbortSignal) =>
  apiJson<EconomySectorRankings>('/api/economy/activity-rankings?limit=100', { cache: 'no-store', signal });

export const getSectorActivities = (sectorId: string, signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>(`/api/actividades?page=1&limit=100&sectorId=${encodeURIComponent(sectorId)}`, { cache: 'no-store', signal });

export const getActivityEnrollments = (activityId: string, signal?: AbortSignal) =>
  apiJson<AdministrationEnrollmentsResponse>(`/api/inscripciones?page=1&limit=100&activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store', signal });

export const getActivityMovements = (activityId: string, signal?: AbortSignal) =>
  apiJson<AdministrationMovementsResponse>(`/api/movimientos?page=1&limit=100&activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store', signal });
export const getActivityTermHistory = (activityId:string,signal?:AbortSignal) =>
  apiJson<{items:ActivityTermHistoryItem[]}>(`/api/administration/activities/${encodeURIComponent(activityId)}/terms` as `/${string}`,{cache:'no-store',signal});

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
  const [categories,sectors,activities,paymentMethods,accounts]=await Promise.all([
    apiJson<MovementCatalogItem[]>('/api/movement-categories',{signal}), apiJson<MovementCatalogItem[]>('/api/sectors',{signal}),
    apiJson<MovementCatalogItem[]>('/api/activities',{signal}), apiJson<MovementCatalogItem[]>('/api/payment-methods',{signal}), apiJson<MovementCatalogItem[]>('/api/finance/accounts',{signal})
  ]); return {categories,sectors,activities,paymentMethods,accounts};
};
export const createAdministrationMovement = (input: Record<string,unknown>, idempotencyKey: string) =>
  apiJson<Record<string,unknown>>('/api/finance/movements',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({ movement: input, reason: 'Registro de movimiento desde Administración' })});

export type EnrollmentCatalogItem={id:string;name:string;status?:string;generatesEnrollments?:boolean};
export const getEnrollmentFormCatalogs=async(signal?:AbortSignal)=>{const [peopleResponse,activitiesResponse]=await Promise.all([
  apiJson<{items:Array<{id:string;firstName?:string;lastName?:string;dni?:string}>}>('/api/people?limit=200',{signal}),
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100',{signal})
]);
 return {people:peopleResponse.items.map(person=>({id:person.id,name:`${person.firstName??''} ${person.lastName??''}`.trim()+(person.dni?` · DNI ${person.dni}`:'')})),activities:activitiesResponse.items.map(activity=>({id:activity.id,name:activity.name,status:activity.status,generatesEnrollments:activity.generatesEnrollments}))};
};
export const createAdministrationEnrollment=(input:Record<string,unknown>)=>apiJson<Record<string,unknown>>('/api/inscripciones',{method:'POST',body:JSON.stringify(input)});
