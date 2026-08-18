import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type EnrollmentActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export type EnrollmentInput = { personId: string; activityId: string; feeAmount: number; status: "al_dia" | "nuevo_inscripto" | "adeudando"; dueDate?: string | null; enrollmentDate: string };
export type EnrollmentResult = { kind: "created"; enrollment: Record<string, unknown> } | { kind: "duplicate"; enrollment: Record<string, unknown> } | { kind: "invalid_reference" };
export type EnrollmentStatusResult = { kind: "updated"; enrollment: Record<string, unknown> } | { kind: "missing" } | { kind: "conflict" };

const columns = "id, club_id, sequence_number, external_id, person_id, activity_id, fee_amount, status, due_date, enrollment_date, source, created_at, updated_at";

/** Audits the tenant-owned person, activity and existing enrollment before inserting anything. */
export const createEnrollment = async (actor: EnrollmentActor, input: EnrollmentInput): Promise<EnrollmentResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (db) => {
    const references = await db.query<{ person_id: string; activity_id: string }>(`
      select p.id person_id, a.id activity_id
      from miclub.people p
      join miclub.activities a on a.club_id = p.club_id
      where p.club_id=$1 and p.id=$2 and a.id=$3
        and a.status='activa'::miclub.entity_status and a.archived_at is null
        and a.generates_enrollments
      for update of p, a
    `, [actor.clubId, input.personId, input.activityId]);
    if (!references.rows[0]) return { kind: "invalid_reference" };

    const existing = await db.query<Record<string, unknown>>(`
      select ${columns} from miclub.enrollments
      where club_id=$1 and person_id=$2 and activity_id=$3
        and status not in ('abandonado','cancelado')
      order by created_at desc limit 1 for update
    `, [actor.clubId, input.personId, input.activityId]);
    if (existing.rows[0]) return { kind: "duplicate", enrollment: existing.rows[0] };

    const inserted = await db.query<Record<string, unknown>>(`
      insert into miclub.enrollments
        (club_id, sequence_number, external_id, person_id, activity_id, fee_amount, status, due_date, enrollment_date, source)
      values ($1, miclub.next_tenant_sequence($1, 'enrollment'), 'manual:'||gen_random_uuid(), $2, $3, $4, $5, $6, $7, 'manual')
      returning ${columns}
    `, [actor.clubId, input.personId, input.activityId, input.feeAmount, input.status, input.dueDate ?? null, input.enrollmentDate]);
    const enrollment = inserted.rows[0];
    await auditService.enrollment({ action: "enrollment.create", result: "success", userId: actor.userId,
      membershipId: actor.membershipId, clubId: actor.clubId, entityType: "enrollment", entityId: String(enrollment.id),
      requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent, oldData: null, newData: enrollment }, db);
    return { kind: "created", enrollment };
  }, pool);
};

/** Sets or clears the explicit override without disabling the automatic lifecycle globally. */
export const setEnrollmentStatus = async (actor: EnrollmentActor, id: string, status: string, override: boolean, expectedUpdatedAt: string): Promise<EnrollmentStatusResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (db) => {
    const before = await db.query<Record<string, unknown>>(`select ${columns} from miclub.enrollments where club_id=$1 and id=$2 for update`, [actor.clubId,id]);
    if (!before.rows[0]) return {kind:"missing"};
    if (new Date(String(before.rows[0].updated_at)).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return {kind:"conflict"};
    const result = await db.query<Record<string, unknown>>(`update miclub.enrollments set status=$3::miclub.enrollment_status,status_override=$4,updated_at=now() where club_id=$1 and id=$2 returning ${columns},status_override`,[actor.clubId,id,status,override]);
    await auditService.enrollment({action:"enrollment.status",result:"success",userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:"enrollment",entityId:id,requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent,oldData:before.rows[0],newData:result.rows[0]},db);
    return {kind:"updated",enrollment:result.rows[0]};
  },pool);
};
