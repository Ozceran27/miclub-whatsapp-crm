import type { ActivityMutationContract, AdministrationActivitiesResponse, AdministrationEnrollmentsResponse, AdministrationMovementsResponse, AdministrationPaginatedResponse, AdministrationSectorCreateDto, AdministrationSectorDto, AdministrationSectorUpdateDto, AdministrationSectorsResponse, AdministrationSummaryResponse, AdministrationWorkerBalancesResponse, AdministrationWorkerMutationDto, AdministrationWorkersResponse, EconomySectorRankings } from '@miclub/shared';
import { apiJson } from '../../api';

export const administrationEndpoints = {
  summary: '/api/administration/summary'
} as const;

export const getAdministrationResource = <T>(key: keyof typeof administrationEndpoints, signal?: AbortSignal) =>
  apiJson<T>(administrationEndpoints[key], { cache: 'no-store', signal });

export const getAdministrationSummary = (signal?: AbortSignal) =>
  getAdministrationResource<AdministrationSummaryResponse>('summary', signal);

const getAllAdministrationRecords = async <T>(path: `/${string}`, signal?: AbortSignal): Promise<AdministrationPaginatedResponse<T>> => {
  const request = (page: number) => apiJson<AdministrationPaginatedResponse<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100` as `/${string}`, { cache: 'no-store', signal });
  const first = await request(1);
  const items = [...first.items];
  for (let page = 2, pages = Math.ceil(first.total / 100); page <= pages; page += 1) {
    const next = await request(page);
    if (!next.items.length) throw new Error('El listado cambió durante la carga. Actualizá para intentarlo de nuevo.');
    items.push(...next.items);
  }
  return { ...first, items };
};

export const getAdministrationSectors = (signal?: AbortSignal): Promise<AdministrationSectorsResponse> =>
  getAllAdministrationRecords('/api/sectores', signal);

export type SectorManagerCandidate = { personId: string; displayName: string };
export const getSectorManagerCandidates = (signal?: AbortSignal) =>
  apiJson<{ items: SectorManagerCandidate[] }>('/api/administration/sector-manager-candidates', { cache: 'no-store', signal });

export const createAdministrationSector = (input: AdministrationSectorCreateDto) =>
  apiJson<Record<string,unknown>>('/api/administration/sectors', { method: 'POST', body: JSON.stringify(input) });
export const updateAdministrationSector = (id:string,input:AdministrationSectorUpdateDto) => apiJson(`/api/sectors/${encodeURIComponent(id)}` as `/${string}`,{method:'PATCH',body:JSON.stringify(input)});
export const changeAdministrationSectorStatus = (id:string,updatedAt:string,status:'active'|'inactive'|'under_repair') => apiJson(`/api/sectors/${encodeURIComponent(id)}/status` as `/${string}`,{method:'PATCH',body:JSON.stringify({updatedAt,status})});
export const archiveAdministrationSector = (id:string,updatedAt:string) => apiJson(`/api/sectors/${encodeURIComponent(id)}/archive` as `/${string}`,{method:'POST',body:JSON.stringify({updatedAt})});

export const getAdministrationActivities = (signal?: AbortSignal): Promise<AdministrationActivitiesResponse> =>
  getAllAdministrationRecords('/api/actividades', signal);

export type ActivityWorkerCatalogItem = { id: string; personId: string; displayName: string; role: string | null };
export type ActivitySectorCatalogItem = Pick<AdministrationSectorDto, 'id' | 'name' | 'status'>;
export const getActivityWorkerCandidates = (signal?: AbortSignal) =>
  apiJson<{ items: ActivityWorkerCatalogItem[] }>('/api/administration/activity-workers', { cache: 'no-store', signal });
export const getActivitySectorCandidates = (signal?: AbortSignal) =>
  apiJson<{ items: ActivitySectorCatalogItem[] }>('/api/administration/activity-sectors', { cache: 'no-store', signal });
export type ActivityTermHistoryItem = { id:string; mode:'FIXED'|'VARIABLE'; fixedClubFee:number|null; fixedFeeFrequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'|null; clubSharePercentage:number|null; currencyCode:string|null; effectiveFrom:string; effectiveTo:string|null; responsiblePersonId:string|null; responsiblePersonName:string|null; revision:number; phase:'FUTURE'|'CURRENT'|'HISTORICAL' };
export type ActivityPriceHistoryItem={id:string;enrollmentPrice:number;feePrice:number;feeFrequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY';currencyCode:string;effectiveFrom:string;effectiveTo:string|null;cancelledAt:string|null};
export type AdministrationActivityMutation = ActivityMutationContract;
export type AdministrationActivityMutationResponse = { id: string; updatedAt: string } & Record<string, unknown>;

export const getActivityFormCatalogs = async (signal?: AbortSignal) => {
  const [sectors, workers, currency] = await Promise.all([
    getActivitySectorCandidates(signal),
    getActivityWorkerCandidates(signal),
    apiJson<{currencyCode:string}>('/api/administration/club-currency',{signal}),
  ]);
  return {
    sectors: sectors.items,
    workers: workers.items,
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
  getAllAdministrationRecords<AdministrationActivitiesResponse['items'][number]>(`/api/actividades?sectorId=${encodeURIComponent(sectorId)}`, signal);

export const getActivityEnrollments = (activityId: string, signal?: AbortSignal) =>
  getAllAdministrationRecords<AdministrationEnrollmentsResponse['items'][number]>(`/api/inscripciones?activityId=${encodeURIComponent(activityId)}`, signal);

export const getActivityMovements = (activityId: string, signal?: AbortSignal) =>
  getAllAdministrationRecords<AdministrationMovementsResponse['items'][number]>(`/api/movimientos?activityId=${encodeURIComponent(activityId)}`, signal);
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

export type MovementCatalogItem = { id: string; code?: string; name: string; displayName?: string; classification?: 'OPERATIONAL'|'NON_OPERATIONAL'|'TAX'|'SERVICE'|'LIABILITY'; displayOrder?: number; sectorId?: string; currencyCode?: string; direction?: 'INGRESOS'|'EGRESOS'|null; isActive?: boolean };
export type MovementFormCatalogs = {categories:MovementCatalogItem[];sectors:MovementCatalogItem[];activities:MovementCatalogItem[];paymentMethods:MovementCatalogItem[];accounts:MovementCatalogItem[]};
export const getMovementFormCatalogs = (signal?: AbortSignal) => apiJson<MovementFormCatalogs>('/api/finance/movement-catalogs',{signal,cache:'no-store'});
export const createAdministrationMovement = (input: Record<string,unknown>, idempotencyKey: string, applications?:{receivableId:string;amount:number}[]) =>
  apiJson<Record<string,unknown>>('/api/finance/movements',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({ movement: input, applications, reason: 'Registro de movimiento desde Administración' })});

export type EnrollmentCatalogItem={id:string;name:string;status?:string;generatesEnrollments?:boolean;pricingConfigured?:boolean;enrollmentPrice?:number|null;feePrice?:number|null;feeFrequency?:string|null;currencyCode?:string|null};
type EnrollmentPerson = { id:string; firstName?:string; lastName?:string; dni?:string };
const getEnrollmentPeople = async (signal?:AbortSignal) => {
  const items: EnrollmentPerson[] = [];
  let total = 0;
  do {
    const response = await apiJson<{items:EnrollmentPerson[];total:number}>(`/api/people?limit=200&offset=${items.length}` as `/${string}`, {signal});
    total = response.total;
    if (!response.items.length && items.length < total) throw new Error('El catálogo de personas cambió durante la carga. Reintentá.');
    items.push(...response.items);
  } while (items.length < total);
  return items;
};
export const getEnrollmentFormCatalogs=async(signal?:AbortSignal)=>{const [peopleResponse,activitiesResponse]=await Promise.all([
  getEnrollmentPeople(signal),
  getAdministrationActivities(signal)
]);
  return {people:peopleResponse.map(person=>({id:person.id,name:`${person.firstName??''} ${person.lastName??''}`.trim()+(person.dni?` · DNI ${person.dni}`:'')})),activities:activitiesResponse.items.map(activity=>({id:activity.id,name:activity.name,status:activity.status,generatesEnrollments:activity.generatesEnrollments,pricingConfigured:activity.pricingConfigured,enrollmentPrice:activity.enrollmentPrice,feePrice:activity.feePrice,feeFrequency:activity.feeFrequency,currencyCode:activity.priceCurrencyCode??activity.operatingCurrencyCode}))};
};
export const createAdministrationEnrollment=(input:Record<string,unknown>)=>apiJson<Record<string,unknown>>('/api/inscripciones',{method:'POST',body:JSON.stringify(input)});
