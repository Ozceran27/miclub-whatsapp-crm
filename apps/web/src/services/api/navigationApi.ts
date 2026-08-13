import { apiJson } from '../../api';
import type { CoreModuleId } from '../../modules/ModuleNav';

export type BackendNavigation = {
  modules: CoreModuleId[];
  sectors: Array<{ id: string; name: string; code: string | null }>;
};

export const getNavigation = (signal?: AbortSignal) => apiJson<BackendNavigation>('/api/modules/navigation', { signal });
