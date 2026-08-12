import type { OnboardingState, OnboardingStep } from "@miclub/shared";
import { advanceOnboarding, completeOnboarding, readOnboarding, type OnboardingActor } from "../repositories/onboardingRepository.js";

export interface OnboardingStore { read(clubId:string):Promise<OnboardingState>; advance(actor:OnboardingActor,step:OnboardingStep):Promise<OnboardingState>; complete(actor:OnboardingActor):Promise<OnboardingState> }
const defaultStore:OnboardingStore={read:readOnboarding,advance:advanceOnboarding,complete:completeOnboarding};
export const createOnboardingService=(store:OnboardingStore=defaultStore)=>({
  read:(clubId:string)=>store.read(clubId),
  advance:(actor:OnboardingActor,step:OnboardingStep)=>store.advance(actor,step),
  complete:(actor:OnboardingActor)=>store.complete(actor),
});
export const onboardingService=createOnboardingService();
