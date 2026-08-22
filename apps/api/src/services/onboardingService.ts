import { isOptionalOnboardingStep, type CompleteOnboardingResult, type OnboardingDraft, type OnboardingState, type OnboardingStep, type OnboardingStepOutcome, type OpeningBalancesRequest, type OpeningBalancesResponse } from "@miclub/shared";
import { advanceOnboarding, completeOnboardingDraft, readOnboarding, saveOpeningBalances, type OnboardingActor } from "../repositories/onboardingRepository.js";
import { validateWorkerMutation } from "./administration/workerMutationService.js";

export interface OnboardingStore { read(clubId:string):Promise<OnboardingState>; advance(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome):Promise<OnboardingState>; complete(actor:OnboardingActor,draft:OnboardingDraft):Promise<CompleteOnboardingResult>; saveOpeningBalances(actor:OnboardingActor,input:OpeningBalancesRequest):Promise<OpeningBalancesResponse> }
const defaultStore:OnboardingStore={read:readOnboarding,advance:advanceOnboarding,complete:completeOnboardingDraft,saveOpeningBalances};
export const createOnboardingService=(store:OnboardingStore=defaultStore)=>({
  read:(clubId:string)=>store.read(clubId),
  advance:(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome)=>{
    const departedStep = (step - 1) as OnboardingStep;
    if (outcome === "SKIPPED" && !isOptionalOnboardingStep(departedStep)) {
      throw Object.assign(new Error("Este paso es obligatorio y no se puede omitir."), { code: "ONBOARDING_SKIP_NOT_ALLOWED" });
    }
    return store.advance(actor,step,outcome);
  },
  complete:(actor:OnboardingActor,draft:OnboardingDraft)=>{
    for(const worker of draft.workers)validateWorkerMutation(worker,true);
    return store.complete(actor,draft);
  },
  saveOpeningBalances:(actor:OnboardingActor,input:OpeningBalancesRequest)=>store.saveOpeningBalances(actor,input),
});
export const onboardingService=createOnboardingService();
