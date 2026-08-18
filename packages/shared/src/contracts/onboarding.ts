export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = typeof ONBOARDING_STATUSES[number];
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type OnboardingStepOutcome = "COMPLETED" | "SKIPPED";

/**
 * Product policy for the onboarding flow. This is the single source of truth
 * consumed by both the API and the web client; a step only gets a skip action
 * after product explicitly marks it as optional here.
 */
export const ONBOARDING_STEP_POLICY = {
  1: { required: true },
  // A club that imports its complete movement history must be able to derive
  // its balances from that ledger instead of creating an artificial opening
  // balance batch (including a misleading all-zero batch).
  2: { required: false },
  3: { required: true },
  4: { required: true },
  5: { required: true },
  6: { required: false },
  7: { required: true },
} as const satisfies Record<OnboardingStep, { required: boolean }>;

const onboardingStepsByRequirement = (required: boolean): OnboardingStep[] =>
  Object.entries(ONBOARDING_STEP_POLICY)
    .filter(([, policy]) => policy.required === required)
    .map(([step]) => Number(step) as OnboardingStep);
export const REQUIRED_ONBOARDING_STEPS: readonly OnboardingStep[] = onboardingStepsByRequirement(true);
export const OPTIONAL_ONBOARDING_STEPS: readonly OnboardingStep[] = onboardingStepsByRequirement(false);
export const isOptionalOnboardingStep = (step: number): step is OnboardingStep =>
  step in ONBOARDING_STEP_POLICY && !ONBOARDING_STEP_POLICY[step as OnboardingStep].required;

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
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  migrationAvailable: boolean;
}

/** The tenant is always taken from the authenticated membership. */
export interface AdvanceOnboardingRequest { currentStep: OnboardingStep; outcome: OnboardingStepOutcome }
export interface OpeningBalancesRequest { cash: number; bank: number; usdCash: number; idempotencyKey: string }
export interface OpeningBalancesResponse { batchId: string }
export type AdvanceOnboardingResponse = OnboardingState;
export type CompleteOnboardingResponse = OnboardingState;
