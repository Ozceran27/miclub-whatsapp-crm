import type { CompleteOnboardingResult, OnboardingDraft, OnboardingState, OpeningBalancesRequest, OpeningBalancesResponse } from '@miclub/shared';
import { apiJson } from '../../api';

export const getOnboarding = (signal?: AbortSignal) => apiJson<OnboardingState>('/api/onboarding', { cache: 'no-store', signal });
export const completeOnboarding = (draft:OnboardingDraft) => apiJson<CompleteOnboardingResult>('/api/onboarding/complete', { method: 'POST',body:JSON.stringify({draft,selectedPlanCode:draft.selectedPlanCode}) });
export const saveOpeningBalances = (input: OpeningBalancesRequest) => apiJson<OpeningBalancesResponse>('/api/onboarding/opening-balances', { method: 'POST', body: JSON.stringify(input) });
