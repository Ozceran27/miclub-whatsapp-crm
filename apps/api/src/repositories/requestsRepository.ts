import type { ApprovalRequest, ApprovalRequestStatus } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type RequestActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
type RequestRow = { id:string; title:string; description:string|null; status:string; target_entity_type:string|null; target_entity_id:string|null; requested_by_user_id:string|null; assigned_to_user_id:string|null; decision_reason:string|null; decided_at:Date|string|null; expires_at:Date|string|null; created_at:Date|string; updated_at:Date|string };
export type DecisionResult = { kind:"updated"; request:ApprovalRequest } | { kind:"missing"|"already_decided"|"unsupported_type" };

const columns="id,title,description,status,target_entity_type,target_entity_id,requested_by_user_id,assigned_to_user_id,decision_reason,decided_at,expires_at,created_at,updated_at";
const iso=(value:Date|string|null)=>value==null?null:new Date(value).toISOString();
const mapRequest=(row:RequestRow):ApprovalRequest=>({id:row.id,title:row.title,description:row.description,status:row.status.toUpperCase() as ApprovalRequestStatus,
  requestType:(row.target_entity_type??"UNSPECIFIED").toUpperCase(),targetEntityId:row.target_entity_id,requestedByUserId:row.requested_by_user_id,
  assignedToUserId:row.assigned_to_user_id,decisionReason:row.decision_reason,decidedAt:iso(row.decided_at),expiresAt:iso(row.expires_at),createdAt:iso(row.created_at)!,updatedAt:iso(row.updated_at)!});

// Every executable request type must be registered here. Handlers receive no metadata or
// arbitrary command payload. MANUAL_REVIEW intentionally only records the decision.
const safeDecisionHandlers:Record<string,(db:QueryExecutor,request:ApprovalRequest)=>Promise<void>>={
  MANUAL_REVIEW:async()=>undefined,
};

export const listRequests=async(clubId:string):Promise<ApprovalRequest[]>=>{
  const db=await getPostgresPool();
  const result=await db.query<RequestRow>(`select ${columns} from miclub.approval_requests where club_id=$1 and archived_at is null order by created_at desc`,[clubId]);
  return result.rows.map(mapRequest);
};
export const getRequest=async(clubId:string,id:string):Promise<ApprovalRequest|null>=>{
  const db=await getPostgresPool(); const result=await db.query<RequestRow>(`select ${columns} from miclub.approval_requests where club_id=$1 and id=$2 and archived_at is null`,[clubId,id]);
  return result.rows[0]?mapRequest(result.rows[0]):null;
};
export const decideRequest=async(actor:RequestActor,id:string,decision:"approved"|"rejected",reason:string|null):Promise<DecisionResult>=>withTransaction(async db=>{
  const current=await db.query<RequestRow>(`select ${columns} from miclub.approval_requests where club_id=$1 and id=$2 and archived_at is null for update`,[actor.clubId,id]);
  if(!current.rows[0])return {kind:"missing"}; const before=mapRequest(current.rows[0]);
  if(before.status!=="PENDING")return {kind:"already_decided"};
  const handler=safeDecisionHandlers[before.requestType]; if(!handler)return {kind:"unsupported_type"};
  await handler(db,before);
  const result=await db.query<RequestRow>(`update miclub.approval_requests set status=$3,decision_reason=$4,decided_by_user_id=$5::uuid,decided_by_membership_id=$6::uuid,decided_at=now(),updated_at=now() where club_id=$1 and id=$2 returning ${columns}`,[actor.clubId,id,decision,reason,actor.userId,actor.membershipId]);
  const after=mapRequest(result.rows[0]);
  await auditService.sensitiveChange({action:`request.${decision}`,result:"success",userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:"approval_request",entityId:id,requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent,oldData:before as unknown as Record<string,unknown>,newData:after as unknown as Record<string,unknown>,metadata:{requestType:before.requestType,handler:"MANUAL_REVIEW"}},db);
  return {kind:"updated",request:after};
},await getPostgresPool());
