import { isActivityIconKey, ROLE_DEFAULT_PERMISSIONS, REQUIRED_ONBOARDING_STEPS, type CompleteOnboardingResult, type OnboardingDraft, type OnboardingState, type OnboardingStatus, type OnboardingStep, type OnboardingStepOutcome, type OpeningBalancesRequest } from "@miclub/shared";
import { hashPassword } from "../auth/passwordHasher.js";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";
import { withTenantTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";
import { billingService } from "../services/billingService.js";
import { readCommercialPlanCatalog } from "../services/planCommercialCatalog.js";
import { storedEntityStatus } from "./entityStatusRepository.js";

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
       and s.effective_from<=now() and (s.effective_until is null or s.effective_until>now())
       and s.billing_status='active'),
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


type CompletionContext = { db:QueryExecutor; actor:OnboardingActor; draft:OnboardingDraft; sectorMap:Map<string,string>; workerMap:Map<string,string>; employeeMap:Map<string,string> };
const completionResultFromRow=(value:unknown):CompleteOnboardingResult=>{
 const stored=value as CompleteOnboardingResult;
 if(stored.recommendedDestination&&stored.capabilities)return stored;
 const dataMigration=Boolean(stored.state?.migrationAvailable);
 return {...stored,recommendedDestination:dataMigration?'MIGRATION':'DASHBOARD',capabilities:{DATA_MIGRATION:dataMigration}};
};

async function validateDraftCatalog(ctx:CompletionContext) {
 const {db,actor,draft}=ctx;
 const catalog=await readCommercialPlanCatalog(db); const selectedPlan=catalog.find(plan=>plan.code===draft.selectedPlanCode);
 if(!selectedPlan)throw Object.assign(new Error('El plan no está activo en el catálogo comercial.'),{code:'ONBOARDING_PLAN_INVALID'});
 const iconKeys=[...new Set(draft.activities.map(item=>item.iconKey))];
 if(!iconKeys.every(isActivityIconKey))throw Object.assign(new Error('El borrador contiene iconos fuera del catálogo compartido.'),{code:'ONBOARDING_ICON_INVALID'});
 if(iconKeys.length){const icons=await db.query<{icon_key:string}>(`select icon_key from miclub.activity_icon_catalog where icon_key=any($1::text[]) and active=true`,[iconKeys]);if(icons.rows.length!==iconKeys.length)throw Object.assign(new Error('El borrador contiene iconos de actividad no disponibles.'),{code:'ONBOARDING_ICON_INVALID'});}
 return selectedPlan;
}
async function finalizePlan(ctx:CompletionContext,planCode:string){const {db,actor}=ctx;const billing=billingService.prepareOnboardingSelection(planCode as Parameters<typeof billingService.prepareOnboardingSelection>[0]);const current=(await db.query<{id:string;plan_code:string;billing_status:string;selection_mode:string;selection_source:string}>(`select id::text,plan_code,billing_status,selection_mode,selection_source from miclub.club_subscriptions where club_id=$1 and effective_from<=now() and (effective_until is null or effective_until>now()) order by effective_from desc,id desc limit 1 for update`,[actor.clubId])).rows[0];if(current?.plan_code===planCode&&current.billing_status===billing.status&&current.selection_mode===billing.mode&&current.selection_source===billing.source)return;await db.query(`update miclub.club_subscriptions set effective_until=now() where club_id=$1 and effective_from<now() and (effective_until is null or effective_until>now())`,[actor.clubId]);await db.query(`insert into miclub.club_subscriptions(club_id,plan_code,effective_from,billing_status,selection_mode,selection_source) values($1,$2,now(),$3,$4,$5)`,[actor.clubId,planCode,billing.status,billing.mode,billing.source]);}
async function finalizeBalances(ctx:CompletionContext){const {db,actor,draft}=ctx;return (await db.query<{batch_id:string}>("select miclub.replace_opening_balances($1,$2,$3,$4,$5,$6,$7) batch_id",[actor.clubId,draft.openingBalances.currency,draft.openingBalances.cash,draft.openingBalances.bank,draft.openingBalances.usdCash,draft.idempotencyKey,actor.userId])).rows[0].batch_id;}
async function finalizeSectors(ctx:CompletionContext){const ids:string[]=[];for(const item of ctx.draft.sectors){if(item.isSystem){const row=(await ctx.db.query<{id:string}>(`update miclub.sectors set capacity_mode=$3,configured_capacity=$4,updated_by=$5,updated_at=now() where club_id=$1 and code=$2 and is_system=true and archived_at is null returning id::text`,[ctx.actor.clubId,item.code,item.capacityMode,item.configuredCapacity,ctx.actor.userId])).rows[0];if(!row)throw Object.assign(new Error('Falta un sector de sistema provisionado.'),{code:'ONBOARDING_SYSTEM_SECTOR_MISSING'});ctx.sectorMap.set(item.clientId,row.id);await auditService.sensitiveChange({action:'onboarding.system_sector_capacity_updated',result:'success',userId:ctx.actor.userId,membershipId:ctx.actor.membershipId,clubId:ctx.actor.clubId,entityType:'sector',entityId:row.id,newData:{capacityMode:item.capacityMode,configuredCapacity:item.configuredCapacity}},ctx.db);continue;}const row=(await ctx.db.query<{id:string}>(`insert into miclub.sectors(club_id,template_id,code,name,icon_key,color,status,capacity_mode,configured_capacity,is_system,created_by,updated_by) values($1,null,$2,$3,$4,$5,$6,$7,$8,false,$9,$9) returning id::text`,[ctx.actor.clubId,item.code,item.name.trim(),item.iconKey,item.color,item.status,item.capacityMode,item.configuredCapacity,ctx.actor.userId])).rows[0];ctx.sectorMap.set(item.clientId,row.id);ids.push(row.id);await auditService.sensitiveChange({action:'onboarding.sector_created',result:'success',userId:ctx.actor.userId,membershipId:ctx.actor.membershipId,clubId:ctx.actor.clubId,entityType:'sector',entityId:row.id,newData:{capacityMode:item.capacityMode,configuredCapacity:item.configuredCapacity}},ctx.db);}return ids;}
async function finalizeWorkers(ctx:CompletionContext){const ids:string[]=[];for(const item of ctx.draft.workers){const exists=await ctx.db.query(`select 1 from miclub.users where lower(email::text)=lower($1) for update`,[item.email]);if(exists.rows[0])throw Object.assign(new Error('No se pudo completar el alta del trabajador.'),{code:'ONBOARDING_WORKER_IDENTITY_CONFLICT'});const hash=await hashPassword(item.password!);const user=(await ctx.db.query<{id:string}>(`insert into miclub.users(email,password_hash,display_name,status,is_active) values($1,$2,$3,'active',true) returning id::text`,[item.email,hash,`${item.firstName} ${item.lastName}`])).rows[0];const person=(await ctx.db.query<{id:string}>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning id::text`,[ctx.actor.clubId,item.firstName,item.lastName,item.dni,item.phone??null,item.email,user.id])).rows[0];const role=(await ctx.db.query<{id:string}>(`select id::text from miclub.roles where club_id=$1 and code=$2`,[ctx.actor.clubId,item.role])).rows[0];if(!role)throw Object.assign(new Error('Rol de trabajador no aprovisionado.'),{code:'ONBOARDING_ROLE_MISSING'});const membership=(await ctx.db.query<{id:string}>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,'{}') returning id::text`,[user.id,ctx.actor.clubId,role.id,[...ROLE_DEFAULT_PERMISSIONS[item.role]]])).rows[0];const employee=(await ctx.db.query<{id:string}>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,currency_code,position,created_by,updated_by) values($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$10) returning id::text`,[ctx.actor.clubId,person.id,user.id,membership.id,item.hasFixedCompensation,item.fixedCompensationAmount,item.fixedCompensationFrequency,item.currencyCode,item.role,ctx.actor.userId])).rows[0];ids.push(employee.id);ctx.employeeMap.set(item.clientId,employee.id);if(item.role==='INSTRUCTOR'){const instructor=(await ctx.db.query<{id:string}>(`insert into miclub.instructors(club_id,person_id,display_name,status) values($1,$2,$3,'activa') returning id::text`,[ctx.actor.clubId,person.id,`${item.firstName} ${item.lastName}`])).rows[0];ctx.workerMap.set(item.clientId,instructor.id);}}return ids;}
async function finalizeActivities(ctx:CompletionContext){const ids:string[]=[];for(const item of ctx.draft.activities){const row=(await ctx.db.query<{id:string}>(`insert into miclub.activities(club_id,sector_id,instructor_id,name,color,icon_key,club_commission_percent,status,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text`,[ctx.actor.clubId,ctx.sectorMap.get(item.sectorClientId),item.instructorClientId?ctx.workerMap.get(item.instructorClientId):null,item.name,item.color,item.iconKey,item.settlementMode==='VARIABLE'?item.clubSharePercentage:0,storedEntityStatus(item.status),ctx.actor.userId])).rows[0];ids.push(row.id);await ctx.db.query(`insert into miclub.activity_terms(club_id,activity_id,mode,fixed_club_fee,fixed_fee_frequency,currency_code,club_share_percentage,effective_from,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,current_date,$8,$8)`,[ctx.actor.clubId,row.id,item.settlementMode,item.fixedClubFee,item.fixedFeeFrequency,item.currencyCode,item.clubSharePercentage,ctx.actor.userId]);}return ids;}
async function finalizeFileAssociations(ctx:CompletionContext){
 for(const worker of ctx.draft.workers){if(!worker.photoFileId)continue;const associated=await ctx.db.query<{object_key:string}>(`update miclub.employee_photos set employee_id=$3,status='active',expires_at=null,updated_at=now() where id=$1 and club_id=$2 and status='temporary' and expires_at>now() returning object_key`,[worker.photoFileId,ctx.actor.clubId,ctx.employeeMap.get(worker.clientId)]);if(!associated.rows[0])throw Object.assign(new Error('La foto temporal no existe, expiró o no pertenece al club.'),{code:'ONBOARDING_PHOTO_INVALID'});}
}

/** One transaction owns every phase; validation performs no writes and completes before the idempotency claim. */
export const completeOnboardingDraft=async(actor:OnboardingActor,draft:OnboardingDraft):Promise<CompleteOnboardingResult>=>withTenantTransaction(actor.clubId,async db=>{
 const ctx:CompletionContext={db,actor,draft,sectorMap:new Map(),workerMap:new Map(),employeeMap:new Map()};
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${actor.clubId}:COMPLETE_ONBOARDING`]);
 const previous=await db.query<{idempotency_key:string;result:unknown}>(`select idempotency_key,result from miclub.onboarding_operations where club_id=$1 and operation='COMPLETE_ONBOARDING' for update`,[actor.clubId]);
 if(previous.rows[0]){if(previous.rows[0].idempotency_key!==draft.idempotencyKey)throw Object.assign(new Error('El onboarding ya fue finalizado con otra operación.'),{code:'ONBOARDING_ALREADY_COMPLETED'});return completionResultFromRow(previous.rows[0].result);}
 const before=await ensure(db,actor.clubId); const selectedPlan=await validateDraftCatalog(ctx);
 await db.query(`insert into miclub.onboarding_operations(club_id,operation,idempotency_key,contract_version,created_by) values($1,'COMPLETE_ONBOARDING',$2,$3,$4)`,[actor.clubId,draft.idempotencyKey,draft.contractVersion,actor.userId]);
 await finalizePlan(ctx,selectedPlan.code);const openingBalanceBatchId=await finalizeBalances(ctx);const sectorIds=await finalizeSectors(ctx);const workerIds=await finalizeWorkers(ctx);const activityIds=await finalizeActivities(ctx);await finalizeFileAssociations(ctx);
 const completed=[1,2,...(sectorIds.length?[3]:[]),...(draft.workers.length?[4]:[]),...(draft.activities.length?[5]:[]),6,7];const skipped=[...(sectorIds.length?[]:[3]),...(draft.workers.length?[]:[4]),...(draft.activities.length?[]:[5])];
 await db.query(`update miclub.club_onboarding set status='COMPLETED',current_step=7,completed_steps=$2,skipped_steps=$3,started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now()),updated_at=now() where club_id=$1`,[actor.clubId,completed,skipped]);const state=map((await db.query<Row>(select,[actor.clubId])).rows[0]);await audit(actor,'onboarding.complete',before,state,db);const dataMigration=state.migrationAvailable;const result={state,recommendedDestination:dataMigration?'MIGRATION' as const:'DASHBOARD' as const,capabilities:{DATA_MIGRATION:dataMigration},created:{openingBalanceBatchId,sectorIds,workerIds,activityIds}};await db.query(`update miclub.onboarding_operations set result=$3::jsonb,completed_at=now() where club_id=$1 and operation=$2`,[actor.clubId,'COMPLETE_ONBOARDING',JSON.stringify(result)]);return result;
},await getPostgresPool());
