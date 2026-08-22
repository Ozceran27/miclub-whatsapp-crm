import type { AdministrationWorkerMutationDto } from "./administration.js";

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
  2: { required: true },
  // The remaining setup can be postponed and completed later from the
  // corresponding administration screens.
  3: { required: false },
  4: { required: false },
  5: { required: false },
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
export const SUPPORTED_OPERATIONAL_CURRENCIES = ["ARS", "USD", "BRL", "EUR"] as const;
export type OperationalCurrency = typeof SUPPORTED_OPERATIONAL_CURRENCIES[number];
export interface OpeningBalancesRequest { currency: OperationalCurrency; cash: number; bank: number; usdCash: number; idempotencyKey: string }
export interface OpeningBalancesResponse { batchId: string }
export type AdvanceOnboardingResponse = OnboardingState;
export type CompleteOnboardingResponse = OnboardingState;

export interface OnboardingSectorDraft { clientId: string; templateId: string; name: string; color: string; status: "active" | "inactive" | "under_repair" }
export interface OnboardingWorkerDraft extends AdministrationWorkerMutationDto { clientId: string }
export interface OnboardingActivityDraft {
  clientId: string; sectorClientId: string; instructorClientId: string | null; name: string; iconKey: string; color: string;
  enrollmentFee: number; settlementMode: "FIXED" | "VARIABLE"; economicValue: number; status: "active" | "inactive";
}
export interface PendingOnboardingImportReference { batchId: string }
/** Complete, client-owned draft. No field in this object is persisted before completion. */
export interface OnboardingDraft {
  idempotencyKey: string;
  openingBalances: Omit<OpeningBalancesRequest, "idempotencyKey">;
  sectors: OnboardingSectorDraft[];
  workers: OnboardingWorkerDraft[];
  activities: OnboardingActivityDraft[];
  pendingImport: PendingOnboardingImportReference | null;
}
export interface CompleteOnboardingRequest { draft: OnboardingDraft }
export interface CompleteOnboardingResult {
  state: OnboardingState;
  created: { openingBalanceBatchId: string; sectorIds: string[]; workerIds: string[]; activityIds: string[] };
}
