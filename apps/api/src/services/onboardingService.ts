import { isOptionalOnboardingStep, type CompleteOnboardingResult, type OnboardingDraft, type OnboardingState, type OnboardingStep, type OnboardingStepOutcome, type OpeningBalancesRequest, type OpeningBalancesResponse } from "@miclub/shared";
import { completeOnboardingDraft, readOnboarding, saveOpeningBalances, type OnboardingActor } from "../repositories/onboardingRepository.js";
import { validateWorkerMutation } from "./administration/workerMutationService.js";
import { logger } from "../lib/logger.js";

export interface OnboardingStore { read(clubId:string):Promise<OnboardingState>; advance(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome):Promise<OnboardingState>; complete(actor:OnboardingActor,draft:OnboardingDraft):Promise<CompleteOnboardingResult>; saveOpeningBalances(actor:OnboardingActor,input:OpeningBalancesRequest):Promise<OpeningBalancesResponse> }
// `advance` remains in the transport contract for older clients, but is a
// read-only compatibility operation. Visual progress belongs to the mount.
const defaultStore:OnboardingStore={read:readOnboarding,advance:(actor)=>readOnboarding(actor.clubId),complete:completeOnboardingDraft,saveOpeningBalances};
export const createOnboardingService=(store:OnboardingStore=defaultStore)=>({
  read:(clubId:string)=>store.read(clubId),
  advance:(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome)=>{
    const departedStep = (step - 1) as OnboardingStep;
    if (outcome === "SKIPPED" && !isOptionalOnboardingStep(departedStep)) {
      throw Object.assign(new Error("Este paso es obligatorio y no se puede omitir."), { code: "ONBOARDING_SKIP_NOT_ALLOWED" });
    }
    // Kept as a no-op for compatibility with clients that still send the old
    // navigation request. No walkthrough progress is durable before complete.
    return store.read(actor.clubId);
  },
  complete:async(actor:OnboardingActor,draft:OnboardingDraft)=>{
    const context={requestId:actor.requestId,club:actor.clubId};
    try {
      logger.info("onboarding completion phase",{...context,phase:"validate"});
      for(const worker of draft.workers)validateWorkerMutation(worker,true);
      logger.info("onboarding completion phase",{...context,phase:"transaction"});
      const result=await store.complete(actor,draft);
      logger.info("onboarding completion phase",{...context,phase:"completed"});
      return result;
    } catch(error) {
      logger.warn("onboarding completion failed",{...context,phase:"failed",errorCode:typeof error==='object'&&error&&'code'in error?String(error.code):"UNEXPECTED"});
      throw error;
    }
  },
  saveOpeningBalances:(actor:OnboardingActor,input:OpeningBalancesRequest)=>store.saveOpeningBalances(actor,input),
});
export const onboardingService=createOnboardingService();
