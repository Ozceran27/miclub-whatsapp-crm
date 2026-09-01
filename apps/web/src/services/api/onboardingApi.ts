import type { CompleteOnboardingResult, OnboardingDraft, OnboardingState, OpeningBalancesRequest, OpeningBalancesResponse } from '@miclub/shared';
import { apiFetch, apiJson, readApiError } from '../../api';

export const getOnboarding = (signal?: AbortSignal) => apiJson<OnboardingState>('/api/onboarding', { cache: 'no-store', signal });
export const completeOnboarding = (draft:OnboardingDraft) => apiJson<CompleteOnboardingResult>('/api/onboarding/complete', { method: 'POST',body:JSON.stringify({draft,selectedPlanCode:draft.selectedPlanCode}) });
export const saveOpeningBalances = (input: OpeningBalancesRequest) => apiJson<OpeningBalancesResponse>('/api/onboarding/opening-balances', { method: 'POST', body: JSON.stringify(input) });
export const uploadOnboardingPhoto = async (file:File) => { const form=new FormData();form.append('file',file);const response=await apiFetch('/api/onboarding/photos',{method:'POST',body:form});if(!response.ok)throw await readApiError(response);return response.json() as Promise<{fileId:string}>; };
export const deleteOnboardingPhoto = async (fileId:string) => { const response=await apiFetch(`/api/onboarding/photos/${encodeURIComponent(fileId)}` as `/${string}`,{method:'DELETE'});if(!response.ok)throw await readApiError(response); };
