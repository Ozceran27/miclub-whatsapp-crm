import type { ActivityMutationContract, AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationSectorCreateDto, AdministrationSectorUpdateDto, AdministrationSectorsResponse, AdministrationSummaryResponse, AdministrationWorkerBalancesResponse, AdministrationWorkerMutationDto, AdministrationWorkersResponse, EconomySectorRankings } from '@miclub/shared';
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

export type SectorManagerCandidate = { personId: string; displayName: string };
export const getSectorManagerCandidates = (signal?: AbortSignal) =>
  apiJson<{ items: SectorManagerCandidate[] }>('/api/administration/sector-manager-candidates', { cache: 'no-store', signal });

export const createAdministrationSector = (input: AdministrationSectorCreateDto) =>
  apiJson<Record<string,unknown>>('/api/administration/sectors', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationSector = (id:string,input:AdministrationSectorUpdateDto) => apiJson(`/api/sectors/${encodeURIComponent(id)}` as `/${string}`,{method:'PATCH',body:JSON.stringify(input)});
export const changeAdministrationSectorStatus = (id:string,updatedAt:string,status:'active'|'inactive'|'under_repair') => apiJson(`/api/sectors/${encodeURIComponent(id)}/status` as `/${string}`,{method:'PATCH',body:JSON.stringify({updatedAt,status})});
export const archiveAdministrationSector = (id:string,updatedAt:string) => apiJson(`/api/sectors/${encodeURIComponent(id)}/archive` as `/${string}`,{method:'POST',body:JSON.stringify({updatedAt})});

export const getAdministrationActivities = (signal?: AbortSignal) =>
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100', { cache: 'no-store', signal });

export type ActivityWorkerCatalogItem = { id: string; personId: string; displayName: string; role: string | null };
export type ActivityTermHistoryItem = { id:string; mode:'FIXED'|'VARIABLE'; fixedClubFee:number|null; fixedFeeFrequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'|null; clubSharePercentage:number|null; currencyCode:string|null; effectiveFrom:string; effectiveTo:string|null; responsiblePersonId:string|null; responsiblePersonName:string|null; revision:number; phase:'FUTURE'|'CURRENT'|'HISTORICAL' };
export type ActivityPriceHistoryItem={id:string;enrollmentPrice:number;feePrice:number;feeFrequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY';currencyCode:string;effectiveFrom:string;effectiveTo:string|null;cancelledAt:string|null};
export type AdministrationActivityMutation = ActivityMutationContract;
export type AdministrationActivityMutationResponse = { id: string; updatedAt: string } & Record<string, unknown>;

export const getActivityFormCatalogs = async (signal?: AbortSignal) => {
  const [sectors, workers, currency] = await Promise.all([
    getAdministrationSectors(signal),
    getAdministrationWorkers(signal),
    apiJson<{currencyCode:string}>('/api/administration/club-currency',{signal}),
  ]);
  const activeWorkers = workers.items.filter((worker) => worker.isActive && worker.personId);
  return {
    sectors: sectors.items.filter((sector) => sector.status === 'active'),
    workers: activeWorkers.map((worker) => ({ id: worker.id, personId: worker.personId!, displayName: worker.displayName, role: worker.role ?? null })),
    currencyCode:currency.currencyCode,
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

export const getAdministrationWorkers = (signal?: AbortSignal, page = 1, limit = 100) =>
  apiJson<AdministrationWorkersResponse>(`/api/administration/workers?page=${page}&limit=${limit}` as `/${string}`, { cache: 'no-store', signal });
export const getAdministrationWorkerBalances = (page: number, signal?: AbortSignal) =>
  apiJson<AdministrationWorkerBalancesResponse>(`/api/administration/workers/balances?page=${page}&limit=20` as `/${string}`, { cache: 'no-store', signal });
export const createAdministrationWorker = (input: AdministrationWorkerMutationDto) => apiJson('/api/administration/workers', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationWorker = (id: string, input: AdministrationWorkerMutationDto) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'PUT', body: JSON.stringify(input) });
export const deleteAdministrationWorkerPhoto = (id: string) => apiJson<{deleted:boolean}>(`/api/administration/workers/${encodeURIComponent(id)}/photo` as `/${string}`, { method: 'DELETE' });
export const archiveAdministrationWorker = (id: string, version: string) => apiJson(`/api/administration/workers/${encodeURIComponent(id)}` as `/${string}`, { method: 'DELETE', body: JSON.stringify({version}) });

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
export const getActivityPriceHistory = (activityId:string,signal?:AbortSignal) =>
  apiJson<{items:ActivityPriceHistoryItem[]}>(`/api/administration/activities/${encodeURIComponent(activityId)}/prices` as `/${string}`,{cache:'no-store',signal});

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

export type EnrollmentCatalogItem={id:string;name:string;status?:string;generatesEnrollments?:boolean;pricingConfigured?:boolean;enrollmentPrice?:number|null;feePrice?:number|null;feeFrequency?:string|null;currencyCode?:string|null};
export const getEnrollmentFormCatalogs=async(signal?:AbortSignal)=>{const [peopleResponse,activitiesResponse]=await Promise.all([
  apiJson<{items:Array<{id:string;firstName?:string;lastName?:string;dni?:string}>}>('/api/people?limit=200',{signal}),
  apiJson<AdministrationActivitiesResponse>('/api/actividades?page=1&limit=100',{signal})
]);
  return {people:peopleResponse.items.map(person=>({id:person.id,name:`${person.firstName??''} ${person.lastName??''}`.trim()+(person.dni?` · DNI ${person.dni}`:'')})),activities:activitiesResponse.items.map(activity=>({id:activity.id,name:activity.name,status:activity.status,generatesEnrollments:activity.generatesEnrollments,pricingConfigured:activity.pricingConfigured,enrollmentPrice:activity.enrollmentPrice,feePrice:activity.feePrice,feeFrequency:activity.feeFrequency,currencyCode:activity.priceCurrencyCode??activity.operatingCurrencyCode}))};
};
export const createAdministrationEnrollment=(input:Record<string,unknown>)=>apiJson<Record<string,unknown>>('/api/inscripciones',{method:'POST',body:JSON.stringify(input)});
