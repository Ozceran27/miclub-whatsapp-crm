import type { AdvanceOnboardingResponse, CompleteOnboardingResult, OnboardingDraft, OnboardingState, OnboardingStep, OnboardingStepOutcome, OpeningBalancesRequest, OpeningBalancesResponse } from '@miclub/shared';
import { apiJson } from '../../api';

export const getOnboarding = (signal?: AbortSignal) => apiJson<OnboardingState>('/api/onboarding', { cache: 'no-store', signal });
export const advanceOnboarding = (currentStep: OnboardingStep, outcome: OnboardingStepOutcome) => apiJson<AdvanceOnboardingResponse>('/api/onboarding/advance', { method: 'PATCH', body: JSON.stringify({ currentStep, outcome }) });
export const completeOnboarding = (draft:OnboardingDraft) => apiJson<CompleteOnboardingResult>('/api/onboarding/complete', { method: 'POST',body:JSON.stringify({draft}) });
export const saveOpeningBalances = (input: OpeningBalancesRequest) => apiJson<OpeningBalancesResponse>('/api/onboarding/opening-balances', { method: 'POST', body: JSON.stringify(input) });
