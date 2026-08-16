import { isOptionalOnboardingStep, type OnboardingState, type OnboardingStep, type OnboardingStepOutcome, type OpeningBalancesRequest, type OpeningBalancesResponse } from "@miclub/shared";
import { advanceOnboarding, completeOnboarding, readOnboarding, saveOpeningBalances, type OnboardingActor } from "../repositories/onboardingRepository.js";

export interface OnboardingStore { read(clubId:string):Promise<OnboardingState>; advance(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome):Promise<OnboardingState>; complete(actor:OnboardingActor):Promise<OnboardingState>; saveOpeningBalances(actor:OnboardingActor,input:OpeningBalancesRequest):Promise<OpeningBalancesResponse> }
const defaultStore:OnboardingStore={read:readOnboarding,advance:advanceOnboarding,complete:completeOnboarding,saveOpeningBalances};
export const createOnboardingService=(store:OnboardingStore=defaultStore)=>({
  read:(clubId:string)=>store.read(clubId),
  advance:(actor:OnboardingActor,step:OnboardingStep,outcome:OnboardingStepOutcome)=>{
    const departedStep = step - 1;
    if (outcome === "SKIPPED" && !isOptionalOnboardingStep(departedStep)) {
      throw Object.assign(new Error("Este paso es obligatorio y no se puede omitir."), { code: "ONBOARDING_SKIP_NOT_ALLOWED" });
    }
    return store.advance(actor,step,outcome);
  },
  complete:(actor:OnboardingActor)=>store.complete(actor),
  saveOpeningBalances:(actor:OnboardingActor,input:OpeningBalancesRequest)=>store.saveOpeningBalances(actor,input),
});
export const onboardingService=createOnboardingService();
