import type { ClubOperationsSummary, Member, SectorOperationalSummary } from '@miclub/shared';
import { apiJson } from '../../api';
import type { Summary, SyncStatus } from '../../modules/Home/useHomeDashboard';

const get = <T>(path: `/${string}`) => apiJson<T>(path, { cache: 'no-store' });

export const homeApi = {
  getSummary: () => get<Summary>('/summary'),
  getMembers: () => get<Member[]>('/members'),
  getDebtors: () => get<Member[]>('/debtors'),
  getSyncStatus: () => get<SyncStatus>('/sync-status'),
  getFinanceSummary: () => get<ClubOperationsSummary>('/club-finance-summary'),
  getSectorSummary: () => get<SectorOperationalSummary>('/sector-operational-summary')
};
