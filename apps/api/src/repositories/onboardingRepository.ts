import type { OnboardingState, OnboardingStatus, OnboardingStep, OnboardingStepOutcome, OpeningBalancesRequest } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";
import { withTenantTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type OnboardingActor = { userId:string; membershipId:string; clubId:string; requestId?:string; ip?:string; userAgent?:string };
type Row = { club_id:string; status:OnboardingStatus; current_step:number; completed_steps:number[]; skipped_steps:number[]; started_at:Date|string|null; completed_at:Date|string|null; created_at:Date|string; updated_at:Date|string; movement_count:string|number; enrollment_count:string|number; migration_available:boolean };
const iso=(v:Date|string|null)=>v==null?null:new Date(v).toISOString();
const steps=(values:number[])=>values.map(value=>value as OnboardingStep);
const map=(r:Row):OnboardingState=>({status:r.status,currentStep:r.current_step as OnboardingStep,startedAt:iso(r.started_at),completedAt:iso(r.completed_at),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,movementCount:Number(r.movement_count),enrollmentCount:Number(r.enrollment_count),shouldShow:r.status!=="COMPLETED",completedSteps:steps(r.completed_steps??[]),skippedSteps:steps(r.skipped_steps??[]),migrationAvailable:r.migration_available});
const select=`select o.*,
 (select count(*) from miclub.movements m where m.club_id=o.club_id) movement_count,
 (select count(*) from miclub.enrollments e where e.club_id=o.club_id) enrollment_count,
 coalesce(
   (select c.enabled from miclub.club_capabilities c
     where c.club_id=o.club_id and c.capability='DATA_MIGRATION'
       and c.effective_from<=now() and (c.effective_until is null or c.effective_until>now())
     order by c.effective_from desc,c.created_at desc limit 1),
   exists(select 1 from miclub.club_subscriptions s
     join miclub.plan_entitlements e on e.plan_code=s.plan_code
     where s.club_id=o.club_id and e.feature_code='DATA_MIGRATION'
       and s.effective_from<=now() and (s.effective_until is null or s.effective_until>now())),
   false) migration_available
 from miclub.club_onboarding o where o.club_id=$1`;
const ensure=async(db:QueryExecutor,clubId:string)=>{await db.query("insert into miclub.club_onboarding (club_id) values ($1) on conflict (club_id) do nothing",[clubId]);return map((await db.query<Row>(select,[clubId])).rows[0]);};
export const readOnboarding=async(clubId:string)=>withTenantTransaction(clubId,db=>ensure(db,clubId),await getPostgresPool());
const audit=(actor:OnboardingActor,action:string,before:OnboardingState,after:OnboardingState,db:QueryExecutor)=>auditService.sensitiveChange({action,result:"success",userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:"club_onboarding",entityId:actor.clubId,requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent,oldData:before as unknown as Record<string,unknown>,newData:after as unknown as Record<string,unknown>},db);

export const advanceOnboarding=async(actor:OnboardingActor,target:OnboardingStep,outcome:OnboardingStepOutcome)=>withTenantTransaction(actor.clubId,async db=>{
 const before=await ensure(db,actor.clubId); if(before.status==="COMPLETED") return before;
 const departed=(target-1) as OnboardingStep;
 if(target===before.currentStep&&((outcome==="COMPLETED"&&before.completedSteps.includes(departed))||(outcome==="SKIPPED"&&before.skippedSteps.includes(departed)))) return before;
 if(target!==before.currentStep+1) throw Object.assign(new Error("Sólo se puede avanzar al paso siguiente."),{code:"ONBOARDING_INVALID_TRANSITION"});
 if(outcome==="SKIPPED"&&(departed===1||departed===7)) throw Object.assign(new Error("Este paso no se puede omitir."),{code:"ONBOARDING_SKIP_NOT_ALLOWED"});
 await db.query(`update miclub.club_onboarding set status='IN_PROGRESS',current_step=$2,
  completed_steps=case when $3='COMPLETED' then array(select distinct unnest(completed_steps||$4::smallint)) else completed_steps end,
  skipped_steps=case when $3='SKIPPED' then array(select distinct unnest(skipped_steps||$4::smallint)) else skipped_steps end,
  started_at=coalesce(started_at,now()),updated_at=now() where club_id=$1`,[actor.clubId,target,outcome,departed]);
 const after=map((await db.query<Row>(select,[actor.clubId])).rows[0]); await audit(actor,`onboarding.${outcome.toLowerCase()}`,before,after,db); return after;
},await getPostgresPool());

export const completeOnboarding=async(actor:OnboardingActor)=>withTenantTransaction(actor.clubId,async db=>{
 const before=await ensure(db,actor.clubId); if(before.status==="COMPLETED") return before;
 const resolved=new Set([...before.completedSteps,...before.skippedSteps]);
 if(before.currentStep!==7||![1,2,3,4,5,6].every(step=>resolved.has(step as OnboardingStep))) throw Object.assign(new Error("Hay pasos de configuración pendientes."),{code:"ONBOARDING_PRECONDITION_FAILED"});
 await db.query(`update miclub.club_onboarding set status='COMPLETED',completed_at=coalesce(completed_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where club_id=$1`,[actor.clubId]);
 const after=map((await db.query<Row>(select,[actor.clubId])).rows[0]); await audit(actor,"onboarding.complete",before,after,db); return after;
},await getPostgresPool());

export const saveOpeningBalances=async(actor:OnboardingActor,input:OpeningBalancesRequest)=>withTenantTransaction(actor.clubId,async db=>{
 const result=await db.query<{batch_id:string}>("select miclub.replace_opening_balances($1,$2,$3,$4,$5,$6) batch_id",[actor.clubId,input.cash,input.bank,input.usdCash,input.idempotencyKey,actor.userId]);
 await auditService.sensitiveChange({action:"onboarding.opening_balances",result:"success",userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:"opening_balance_batch",entityId:result.rows[0].batch_id,requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent,newData:{cash:input.cash,bank:input.bank,usdCash:input.usdCash}},db);
 return {batchId:result.rows[0].batch_id};
},await getPostgresPool());
