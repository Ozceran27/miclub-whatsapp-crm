import type { ClubOperationsSummary, Member, SectorOperationalSummary } from '@miclub/shared';
import { apiJson } from '../../api';
import type { Summary, SyncStatus } from '../../modules/Home/useHomeDashboard';

const get = <T>(path: `/${string}`, signal?: AbortSignal) => apiJson<T>(path, { cache: 'no-store', signal });

export const homeApi = {
  getSummary: (signal?: AbortSignal) => get<Summary>('/summary', signal),
  getMembers: (signal?: AbortSignal) => get<Member[]>('/members', signal),
  getDebtors: (signal?: AbortSignal) => get<Member[]>('/debtors', signal),
  getSyncStatus: (signal?: AbortSignal) => get<SyncStatus>('/sync-status', signal),
  getFinanceSummary: (signal?: AbortSignal) => get<ClubOperationsSummary>('/club-finance-summary', signal),
  getSectorSummary: (signal?: AbortSignal) => get<SectorOperationalSummary>('/sector-operational-summary', signal)
};
