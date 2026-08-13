import { apiJson } from '../../api';
import type { CoreModuleId } from '../../modules/ModuleNav';
import type { ClubCapability } from '@miclub/shared';

export type BackendNavigation = {
  modules: CoreModuleId[];
  sectors: Array<{ id: string; name: string; code: string | null }>;
  capabilities: ClubCapability[];
};

export const getNavigation = (signal?: AbortSignal) => apiJson<BackendNavigation>('/api/modules/navigation', { signal });
