import assert from "node:assert/strict";
import test from "node:test";
import type { OnboardingState, OnboardingStep } from "@miclub/shared";
import { createOnboardingService, type OnboardingStore } from "./onboardingService.js";

const state=(overrides:Partial<OnboardingState>={}):OnboardingState=>({status:"NOT_STARTED",currentStep:1,startedAt:null,completedAt:null,createdAt:"2026-08-12T00:00:00.000Z",updatedAt:"2026-08-12T00:00:00.000Z",movementCount:0,enrollmentCount:0,shouldShow:true,...overrides});
const actor={userId:"user-1",membershipId:"membership-1",clubId:"club-1"};
const fixture=(initial=state())=>{let current=initial;let writes=0;const store:OnboardingStore={read:async()=>current,advance:async(_actor,step:OnboardingStep)=>{if(current.status!=="COMPLETED"&&!(current.status==="IN_PROGRESS"&&step<=current.currentStep)){writes++;current=state({...current,status:"IN_PROGRESS",currentStep:Math.max(step,current.currentStep) as OnboardingStep,startedAt:current.startedAt??"2026-08-12T01:00:00.000Z"});}return current;},complete:async()=>{if(current.status!=="COMPLETED"){writes++;current=state({...current,status:"COMPLETED",completedAt:"2026-08-12T02:00:00.000Z",shouldShow:false});}return current;}};return {service:createOnboardingService(store),writes:()=>writes};};

test("primera entrada y refresh conservan NOT_STARTED sin escrituras de avance",async()=>{const f=fixture();assert.equal((await f.service.read(actor.clubId)).shouldShow,true);assert.deepEqual(await f.service.read(actor.clubId),await f.service.read(actor.clubId));assert.equal(f.writes(),0);});
test("reanuda el paso alcanzado y repetir el avance es idempotente",async()=>{const f=fixture(state({status:"IN_PROGRESS",currentStep:4,startedAt:"2026-08-12T01:00:00.000Z"}));assert.equal((await f.service.read(actor.clubId)).currentStep,4);await f.service.advance(actor,4);assert.equal(f.writes(),0);assert.equal((await f.service.advance(actor,5)).currentStep,5);assert.equal(f.writes(),1);});
test("club vacío completado no vuelve a mostrar onboarding ni duplica finalización",async()=>{const f=fixture();assert.equal((await f.service.complete(actor)).shouldShow,false);await f.service.complete(actor);assert.equal(f.writes(),1);});
test("club con movimientos o inscripciones no muestra onboarding aunque esté incompleto",async()=>{for(const counts of [{movementCount:1,enrollmentCount:0},{movementCount:0,enrollmentCount:2}]){const f=fixture(state({...counts,shouldShow:false}));assert.equal((await f.service.read(actor.clubId)).shouldShow,false);}});
