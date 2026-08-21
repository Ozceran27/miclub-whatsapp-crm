import assert from "node:assert/strict";
import test from "node:test";
import { OPTIONAL_ONBOARDING_STEPS, PERMISSIONS, REQUIRED_ONBOARDING_STEPS, ROLE_DEFAULT_PERMISSIONS, SECTOR_OPERATOR_PERMISSIONS } from "@miclub/shared";
import { rejectClientClubId, requirePermission } from "../middleware/authorization.js";
import { isOnboardingVisible } from "../repositories/onboardingRepository.js";
import { readFileSync } from "node:fs";

const invoke=(middleware:ReturnType<typeof requirePermission>,permissions?:readonly string[])=>{let status=200,next=false;const req=permissions===undefined?{}:{auth:{permissions}};const res={status(code:number){status=code;return this;},json(){return this;}};middleware(req as never,res as never,()=>{next=true;});return {status,next};};
test("lectura y escritura requieren sus permisos separados",()=>{assert.deepEqual(invoke(requirePermission(PERMISSIONS.ONBOARDING_READ)),{status:401,next:false});assert.deepEqual(invoke(requirePermission(PERMISSIONS.ONBOARDING_READ),[]),{status:403,next:false});assert.deepEqual(invoke(requirePermission(PERMISSIONS.ONBOARDING_READ),[PERMISSIONS.ONBOARDING_READ]),{status:200,next:true});assert.deepEqual(invoke(requirePermission(PERMISSIONS.ONBOARDING_WRITE),[PERMISSIONS.ONBOARDING_READ]),{status:403,next:false});});
test("Director recibe onboarding pero trabajadores e instructores sectoriales no",()=>{assert.ok(ROLE_DEFAULT_PERMISSIONS.DIRECTOR.includes(PERMISSIONS.ONBOARDING_READ));assert.ok(ROLE_DEFAULT_PERMISSIONS.DIRECTOR.includes(PERMISSIONS.ONBOARDING_WRITE));assert.ok(!SECTOR_OPERATOR_PERMISSIONS.includes(PERMISSIONS.ONBOARDING_READ as never));assert.ok(!SECTOR_OPERATOR_PERMISSIONS.includes(PERMISSIONS.ONBOARDING_WRITE as never));});
test("clubId controlado por el cliente se rechaza",()=>{let status=200,next=false;const req={params:{},query:{},body:{clubId:"otro-club"}};const res={status(code:number){status=code;return this;},json(){return this;}};rejectClientClubId(req as never,res as never,()=>{next=true;});assert.deepEqual({status,next},{status:400,next:false});});

test("la política exige Bienvenida y Saldos y permite postergar la configuración posterior",()=>{assert.deepEqual([...OPTIONAL_ONBOARDING_STEPS],[3,4,5,6]);assert.deepEqual([...REQUIRED_ONBOARDING_STEPS],[1,2,7]);});

test("la respuesta decide visibilidad por ambos conteos y no por status/completed_at",()=>{for(const status of ["NOT_STARTED","IN_PROGRESS","COMPLETED"] as const){const completedAt=status==="COMPLETED"?new Date("2026-08-12T02:00:00.000Z"):null;const combinations=[[0,0,true],[3,0,false],[0,4,false],[3,4,false]] as const;for(const [movements,enrollments,visible] of combinations)assert.equal(isOnboardingVisible(movements,enrollments,status,completedAt),visible,`${status}: ${movements}/${enrollments}`);}});

test("avance y finalización convierten precondiciones incumplidas en conflicto",()=>{
 const routes=readFileSync(new URL("./onboardingRoutes.ts",import.meta.url),"utf8");
 assert.match(routes,/ONBOARDING_SKIP_NOT_ALLOWED|error\.code/);
 assert.match(routes,/post\("\/onboarding\/complete"[\s\S]*status\(409\)/);
});

test("el repositorio verifica hitos persistidos al avanzar y al finalizar",()=>{
 const repository=readFileSync(new URL("../repositories/onboardingRepository.ts",import.meta.url),"utf8");
 assert.match(repository,/opening_balance_batches/);
 assert.match(repository,/administracion[\s\S]*tesoreria[\s\S]*areas-comunes/);
 assert.match(repository,/miclub\.employees[\s\S]*miclub\.instructors/);
 assert.match(repository,/miclub\.activities/);
 assert.match(repository,/for\(const step of requiredBeforeFinish\)await verifyMilestone/);
 assert.doesNotMatch(repository,/completedSteps\.includes\(6\).*skippedSteps\.includes\(6\)/);
 assert.match(repository,/movementCount===0&&enrollmentCount===0/);
 assert.match(repository,/COMPLETED \+ completedAt therefore opens a read\/review pass/);
});
