export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = typeof ONBOARDING_STATUSES[number];
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface OnboardingState {
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  movementCount: number;
  enrollmentCount: number;
  shouldShow: boolean;
}

/** The tenant is always taken from the authenticated membership. */
export interface AdvanceOnboardingRequest { currentStep: OnboardingStep }
export type AdvanceOnboardingResponse = OnboardingState;
export type CompleteOnboardingResponse = OnboardingState;
