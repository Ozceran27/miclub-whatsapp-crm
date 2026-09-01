import type { AdministrationWorkerMutationDto } from "./administration.js";
import type { CommercialPlanCode } from "./commercialPlans.js";

export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = typeof ONBOARDING_STATUSES[number];
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type OnboardingStepOutcome = "COMPLETED" | "SKIPPED";
export const ONBOARDING_DRAFT_CONTRACT_VERSION = 2 as const;
export type OnboardingStepRequirement = "WELCOME" | "OPENING_BALANCES" | "SECTORS" | "WORKERS" | "ACTIVITIES" | "MIGRATION" | "FINISH";

/**
 * Product policy for the onboarding flow. This is the single source of truth
 * consumed by both the API and the web client; a step only gets a skip action
 * after product explicitly marks it as optional here.
 */
export const ONBOARDING_STEP_POLICY = {
  1: { required: true, requirement: "WELCOME", canContinueWithEmptyDraft: false },
  2: { required: true, requirement: "OPENING_BALANCES", canContinueWithEmptyDraft: false, requiredFields: ["currency", "cash", "bank", "usdCash"] },
  // The remaining setup can be postponed and completed later from the
  // corresponding administration screens.
  3: { required: false, requirement: "SECTORS", canContinueWithEmptyDraft: true },
  4: { required: false, requirement: "WORKERS", canContinueWithEmptyDraft: true },
  5: { required: false, requirement: "ACTIVITIES", canContinueWithEmptyDraft: true },
  6: { required: false, requirement: "MIGRATION", canContinueWithEmptyDraft: true },
  7: { required: true, requirement: "FINISH", canContinueWithEmptyDraft: false },
} as const satisfies Record<OnboardingStep, { required: boolean; requirement: OnboardingStepRequirement; canContinueWithEmptyDraft: boolean; requiredFields?: readonly string[] }>;

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
  /** @deprecated Legacy progress snapshot. Clients must start every editing session at step 1. */
  currentStep: OnboardingStep;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  movementCount: number;
  enrollmentCount: number;
  shouldShow: boolean;
  /** @deprecated Legacy progress snapshot; it is not updated while editing. */
  completedSteps: OnboardingStep[];
  /** @deprecated Legacy progress snapshot; it is not updated while editing. */
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

export const PROVISIONED_ONBOARDING_SECTORS = [
  { clientId: "system:administracion", code: "administracion", name: "Administración", iconKey: "administration", isSystem: true },
  { clientId: "system:tesoreria", code: "tesoreria", name: "Tesorería", iconKey: "treasury", isSystem: true },
  { clientId: "system:areas-comunes", code: "areas-comunes", name: "Áreas Comunes", iconKey: "social-hall", isSystem: true },
] as const;
export type ProvisionedOnboardingSectorCode = typeof PROVISIONED_ONBOARDING_SECTORS[number]["code"];
type OnboardingSectorDraftBase = { clientId: string; code: string; name: string; iconKey: string; color: string; status: "active" | "inactive" | "under_repair"; isSystem: boolean };
/** Capacity is deliberately discriminated so an income-based sector can never carry a stale enrollment limit. */
export type OnboardingSectorDraft = OnboardingSectorDraftBase & (
  | { capacityMode: "ENROLLMENTS"; configuredCapacity: number }
  | { capacityMode: "INCOME"; configuredCapacity: null }
);
/** Opaque capability returned by the authenticated temporary-photo endpoint. */
export type OnboardingPhotoFileId = string;
export interface OnboardingWorkerDraft extends AdministrationWorkerMutationDto {
  clientId: string;
  /** Never contains image bytes, an object-store key, or a public URL. */
  photoFileId?: OnboardingPhotoFileId | null;
}
export type ActivityFeeFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type OnboardingActivityDraft = {
  clientId: string; sectorClientId: string; instructorClientId: string | null; name: string; iconKey: string; color: string;
  status: "active" | "inactive";
} & ({ settlementMode: "FIXED"; fixedClubFee: number; fixedFeeFrequency: ActivityFeeFrequency; currencyCode: OperationalCurrency; clubSharePercentage: null }
  | { settlementMode: "VARIABLE"; fixedClubFee: null; fixedFeeFrequency: null; currencyCode: null; clubSharePercentage: number });
export interface PendingOnboardingImportReference { batchId: string }
/** Complete, client-owned draft. No field in this object is persisted before completion. */
export interface OnboardingDraft {
  contractVersion: typeof ONBOARDING_DRAFT_CONTRACT_VERSION;
  idempotencyKey: string;
  selectedPlanCode: CommercialPlanCode;
  openingBalances: Omit<OpeningBalancesRequest, "idempotencyKey">;
  sectors: OnboardingSectorDraft[];
  workers: OnboardingWorkerDraft[];
  activities: OnboardingActivityDraft[];
  pendingImport: PendingOnboardingImportReference | null;
}
export interface CompleteOnboardingRequest { draft: OnboardingDraft; selectedPlanCode: CommercialPlanCode }
export interface CompleteOnboardingResult {
  state: OnboardingState;
  created: { openingBalanceBatchId: string; sectorIds: string[]; workerIds: string[]; activityIds: string[] };
}
