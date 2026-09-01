import type { CommercialPlan } from '@miclub/shared';
import { apiJson } from '../../api';

export const getCommercialPlans = (signal?: AbortSignal) =>
  apiJson<CommercialPlan[]>('/api/commercial-plans', { cache: 'no-store', signal });
