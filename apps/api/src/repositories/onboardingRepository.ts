import { ROLE_DEFAULT_PERMISSIONS, REQUIRED_ONBOARDING_STEPS, type CompleteOnboardingResult, type OnboardingDraft, type OnboardingState, type OnboardingStatus, type OnboardingStep, type OnboardingStepOutcome, type OpeningBalancesRequest } from "@miclub/shared";
import { hashPassword } from "../auth/passwordHasher.js";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";
import { withTenantTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type OnboardingActor = { userId:string; membershipId:string; clubId:string; requestId?:string; ip?:string; userAgent?:string };
type Row = { club_id:string; status:OnboardingStatus; current_step:number; completed_steps:number[]; skipped_steps:number[]; started_at:Date|string|null; completed_at:Date|string|null; created_at:Date|string; updated_at:Date|string; movement_count:string|number; enrollment_count:string|number; migration_available:boolean };
const iso=(v:Date|string|null)=>v==null?null:new Date(v).toISOString();
const steps=(values:number[])=>values.map(value=>value as OnboardingStep);

/** Completion is an explicit, durable product decision. Business activity can
 * never replace it: an unfinished empty club still sees onboarding, while a
 * completed club never sees it again even when it has no movements/enrollments. */
export const isOnboardingVisible=(_movementCount:number,_enrollmentCount:number,status:OnboardingStatus,completedAt:Date|string|null)=>status!=="COMPLETED"&&completedAt===null;

const map=(r:Row):OnboardingState=>{const movementCount=Number(r.movement_count);const enrollmentCount=Number(r.enrollment_count);return {status:r.status,currentStep:r.current_step as OnboardingStep,startedAt:iso(r.started_at),completedAt:iso(r.completed_at),createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,movementCount,enrollmentCount,shouldShow:isOnboardingVisible(movementCount,enrollmentCount,r.status,r.completed_at),completedSteps:steps(r.completed_steps??[]),skippedSteps:steps(r.skipped_steps??[]),migrationAvailable:r.migration_available};};
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

const milestoneSql:Partial<Record<OnboardingStep,string>>={
  2:`exists(select 1 from miclub.opening_balance_batches b where b.club_id=$1 and b.status='APPLIED' and b.reconciliation_status='RECONCILED')`,
  3:`not exists(
    select required.code from (values ('administracion'),('tesoreria'),('areas-comunes')) required(code)
    where not exists(select 1 from miclub.sectors s where s.club_id=$1 and s.code=required.code and s.status::text in ('active','activa') and s.archived_at is null)
  )`,
  4:`exists(
    select 1 from miclub.employees e join miclub.people p on p.id=e.person_id and p.club_id=e.club_id
    where e.club_id=$1 and e.status='active' and e.archived_at is null and p.status::text in ('active','activa')
    union all
    select 1 from miclub.instructors i join miclub.people p on p.id=i.person_id and p.club_id=i.club_id
    where i.club_id=$1 and p.status::text in ('active','activa')
  )`,
  5:`exists(
    select 1 from miclub.activities a
    join miclub.sectors s on s.id=a.sector_id and s.club_id=a.club_id and s.status::text in ('active','activa') and s.archived_at is null
    left join miclub.instructors i on i.id=a.instructor_id and i.club_id=a.club_id
    where a.club_id=$1 and a.status::text in ('active','activa') and a.archived_at is null
      and (a.instructor_id is null or i.id is not null)
  )`,
};
const verifyMilestone=async(db:QueryExecutor,clubId:string,step:OnboardingStep)=>{
 const sql=milestoneSql[step]; if(!sql)return;
 const result=await db.query<{valid:boolean}>(`select ${sql} as valid`,[clubId]);
 if(!result.rows[0]?.valid)throw Object.assign(new Error("El paso todavía no cumple sus datos obligatorios."),{code:"ONBOARDING_MILESTONE_NOT_MET"});
};

/**
 * @deprecated Navigation is local to the web mount. This compatibility method
 * deliberately performs a read only; current_step/completed_steps/skipped_steps
 * remain legacy columns until a later contract and schema migration removes them.
 */
export const advanceOnboarding=async(actor:OnboardingActor,_target:OnboardingStep,_outcome:OnboardingStepOutcome)=>readOnboarding(actor.clubId);

export const completeOnboarding=async(actor:OnboardingActor)=>withTenantTransaction(actor.clubId,async db=>{
 const before=await ensure(db,actor.clubId); if(before.status==="COMPLETED") return before;
 const requiredBeforeFinish=REQUIRED_ONBOARDING_STEPS.filter(step=>step!==7);
 // Reaching step 7 proves that every prior screen was visited. Only required
 // milestones must be completed; optional setup may have been postponed.
 if(before.currentStep!==7||!requiredBeforeFinish.every(step=>before.completedSteps.includes(step))) throw Object.assign(new Error("Hay pasos obligatorios pendientes."),{code:"ONBOARDING_PRECONDITION_FAILED"});
 for(const step of requiredBeforeFinish)await verifyMilestone(db,actor.clubId,step);
 await db.query(`update miclub.club_onboarding set status='COMPLETED',completed_at=coalesce(completed_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where club_id=$1`,[actor.clubId]);
 const after=map((await db.query<Row>(select,[actor.clubId])).rows[0]); await audit(actor,"onboarding.complete",before,after,db); return after;
},await getPostgresPool());

export const saveOpeningBalances=async(actor:OnboardingActor,input:OpeningBalancesRequest)=>withTenantTransaction(actor.clubId,async db=>{
 const result=await db.query<{batch_id:string}>("select miclub.replace_opening_balances($1,$2,$3,$4,$5,$6,$7) batch_id",[actor.clubId,input.currency,input.cash,input.bank,input.usdCash,input.idempotencyKey,actor.userId]);
 await auditService.sensitiveChange({action:"onboarding.opening_balances",result:"success",userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:"opening_balance_batch",entityId:result.rows[0].batch_id,requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent,newData:{currency:input.currency,cash:input.cash,bank:input.bank,usdCash:input.usdCash}},db);
 return {batchId:result.rows[0].batch_id};
},await getPostgresPool());

/** The only write boundary used by the onboarding UI. Every query shares this transaction. */
export const completeOnboardingDraft=async(actor:OnboardingActor,draft:OnboardingDraft):Promise<CompleteOnboardingResult>=>withTenantTransaction(actor.clubId,async db=>{
 // Serialize every completion for the club; the draft key is also the unique
 // opening-balance key, so retries can neither interleave nor duplicate data.
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[actor.clubId]);
 const before=await ensure(db,actor.clubId);
 if(before.status==='COMPLETED')return {state:before,created:{openingBalanceBatchId:'',sectorIds:[],workerIds:[],activityIds:[]}};
 const balance=(await db.query<{batch_id:string}>("select miclub.replace_opening_balances($1,$2,$3,$4,$5,$6,$7) batch_id",[actor.clubId,draft.openingBalances.currency,draft.openingBalances.cash,draft.openingBalances.bank,draft.openingBalances.usdCash,draft.idempotencyKey,actor.userId])).rows[0];
 const sectorMap=new Map<string,string>(),sectorIds:string[]=[];
 for(const item of draft.sectors){
  if(item.isSystem){const row=(await db.query<{id:string}>(`select id::text from miclub.sectors where club_id=$1 and code=$2 and is_system=true and archived_at is null`,[actor.clubId,item.code])).rows[0];if(!row)throw Object.assign(new Error('Falta un sector de sistema provisionado.'),{code:'ONBOARDING_SYSTEM_SECTOR_MISSING'});sectorMap.set(item.clientId,row.id);continue;}
  const row=(await db.query<{id:string}>(`insert into miclub.sectors(club_id,template_id,code,name,color,status,is_system,created_by,updated_by) values($1,nullif($2,'')::uuid,$3,$4,$5,$6,false,$7,$7) returning id::text`,[actor.clubId,item.templateId,item.code,item.name.trim(),item.color,item.status,actor.userId])).rows[0];sectorMap.set(item.clientId,row.id);sectorIds.push(row.id);
 }
 const workerMap=new Map<string,string>(),workerIds:string[]=[];
 for(const item of draft.workers){
  const passwordHash=await hashPassword(item.password!);const user=(await db.query<{id:string}>(`insert into miclub.users(email,password_hash,display_name,status,is_active) values($1,$2,$3,'active',true) returning id::text`,[item.email,passwordHash,`${item.firstName} ${item.lastName}`])).rows[0];
  const person=(await db.query<{id:string}>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning id::text`,[actor.clubId,item.firstName,item.lastName,item.dni,item.phone??null,item.email,user.id])).rows[0];
  const role=(await db.query<{id:string}>(`select id::text from miclub.roles where club_id=$1 and code=$2`,[actor.clubId,item.role])).rows[0];if(!role)throw new Error('Rol de trabajador no aprovisionado.');
  const membership=(await db.query<{id:string}>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,'{}') returning id::text`,[user.id,actor.clubId,role.id,[...ROLE_DEFAULT_PERMISSIONS[item.role]]])).rows[0];
  const employee=(await db.query<{id:string}>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,status,payment_mode,monthly_fixed_amount,position,created_by,updated_by) values($1,$2,$3,$4,'active',$5,$6,$7,$8,$8) returning id::text`,[actor.clubId,person.id,user.id,membership.id,item.paymentMode,item.monthlyFixedAmount??null,item.role,actor.userId])).rows[0];workerIds.push(employee.id);
  if(item.role==='INSTRUCTOR'){const instructor=(await db.query<{id:string}>(`insert into miclub.instructors(club_id,person_id,display_name,status) values($1,$2,$3,'activa') returning id::text`,[actor.clubId,person.id,`${item.firstName} ${item.lastName}`])).rows[0];workerMap.set(item.clientId,instructor.id);}
 }
 const activityIds:string[]=[];
 for(const item of draft.activities){const activity=(await db.query<{id:string}>(`insert into miclub.activities(club_id,sector_id,instructor_id,name,color,icon_key,monthly_fee,club_commission_percent,status,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id::text`,[actor.clubId,sectorMap.get(item.sectorClientId),item.instructorClientId?workerMap.get(item.instructorClientId):null,item.name,item.color,item.iconKey,item.enrollmentFee,item.settlementMode==='VARIABLE'?item.economicValue:0,item.status==='active'?'activa':'suspendida',actor.userId])).rows[0];activityIds.push(activity.id);await db.query(`insert into miclub.activity_terms(club_id,activity_id,mode,monthly_fixed_fee,club_share_percentage,effective_from,created_by,updated_by) values($1,$2,$3,$4,$5,current_date,$6,$6)`,[actor.clubId,activity.id,item.settlementMode,item.settlementMode==='FIXED'?item.economicValue:null,item.settlementMode==='VARIABLE'?item.economicValue:null,actor.userId]);}
 await db.query(`update miclub.club_onboarding set status='COMPLETED',current_step=7,completed_steps='{1,2,7}',started_at=coalesce(started_at,now()),completed_at=now(),updated_at=now() where club_id=$1`,[actor.clubId]);
 const state=map((await db.query<Row>(select,[actor.clubId])).rows[0]);await audit(actor,'onboarding.complete',before,state,db);
 return {state,created:{openingBalanceBatchId:balance.batch_id,sectorIds,workerIds,activityIds}};
},await getPostgresPool());
