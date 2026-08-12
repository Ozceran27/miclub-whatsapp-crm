import type { AdvanceOnboardingResponse, CompleteOnboardingResponse, OnboardingState, OnboardingStep } from '@miclub/shared';
import { apiJson } from '../../api';

export const getOnboarding = (signal?: AbortSignal) => apiJson<OnboardingState>('/api/onboarding', { cache: 'no-store', signal });
export const advanceOnboarding = (currentStep: OnboardingStep) => apiJson<AdvanceOnboardingResponse>('/api/onboarding/advance', { method: 'PATCH', body: JSON.stringify({ currentStep }) });
export const completeOnboarding = () => apiJson<CompleteOnboardingResponse>('/api/onboarding/complete', { method: 'POST' });
