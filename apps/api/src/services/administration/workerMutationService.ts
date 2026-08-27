import { createHash, randomBytes } from "node:crypto";
import { ROLE_DEFAULT_PERMISSIONS, type AdministrationWorkerMutationDto } from "@miclub/shared";
import { hashPassword } from "../../auth/passwordHasher.js";
import { validatePublicPassword } from "../../auth/registrationService.js";
import { getPostgresPool, type QueryExecutor } from "../../db/postgres.js";
import { withTenantTransaction, withTransaction } from "../../db/transaction.js";
import { auditService } from "../auditService.js";

export type WorkerActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export class WorkerMutationError extends Error {
  constructor(public readonly code: "invalid_input" | "conflict" | "dni_conflict" | "worker_exists" | "not_found" | "last_director" | "invitation_invalid", message: string) { super(message); }
}

export type WorkerInvitationResult = { invitationPending: true };
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

const roles = ["TRABAJADOR", "INSTRUCTOR", "DIRECTOR"] as const;
const cleanText = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
export const validateWorkerMutation = (body: unknown, requirePassword: boolean): AdministrationWorkerMutationDto => {
  const raw = (body && typeof body === "object" ? body : {}) as Partial<AdministrationWorkerMutationDto>;
  const firstName = cleanText(raw.firstName); const lastName = cleanText(raw.lastName);
  const dni = cleanText(raw.dni).replace(/\D/g, ""); const email = cleanText(raw.email).toLowerCase();
  if (!firstName || !lastName || !/^\d{7,9}$/.test(dni) || !roles.includes(raw.role as typeof roles[number])) throw new WorkerMutationError("invalid_input", "Nombre, apellido, DNI y rol válidos son obligatorios.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WorkerMutationError("invalid_input", "Se requiere un correo electrónico válido para el acceso.");
  if (requirePassword || raw.password !== undefined) {
    try { validatePublicPassword(raw.password); } catch (error) { throw new WorkerMutationError("invalid_input", error instanceof Error ? error.message : "Contraseña inválida."); }
  }
  if (typeof raw.hasFixedCompensation !== "boolean") throw new WorkerMutationError("invalid_input", "hasFixedCompensation debe ser booleano.");
  const amount = raw.fixedCompensationAmount == null ? null : Number(raw.fixedCompensationAmount);
  const frequency = raw.fixedCompensationFrequency ?? null;
  const validFrequency = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(frequency));
  if ((raw.hasFixedCompensation && (amount == null || !Number.isFinite(amount) || amount < 0 || !validFrequency)) || (!raw.hasFixedCompensation && (amount !== null || frequency !== null))) throw new WorkerMutationError("invalid_input", "La remuneración fija habilitada exige monto no negativo y frecuencia; deshabilitada exige ambos valores nulos.");
  return { ...raw, firstName, lastName, dni, email, phone: cleanText(raw.phone) || null, role: raw.role, hasFixedCompensation: raw.hasFixedCompensation, fixedCompensationAmount: amount, fixedCompensationFrequency: frequency } as AdministrationWorkerMutationDto;
};

const audit = (executor: QueryExecutor, actor: WorkerActor, action: string, id: string, oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) => auditService.sensitiveChange({
  action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
  entityType: "employee", entityId: id, oldData, newData, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
}, executor);

export const createWorker = async (actor: WorkerActor, body: unknown): Promise<Record<string, unknown>> => {
  const input = validateWorkerMutation(body, false); const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (db) => {
    const personResult = await db.query<Record<string, unknown>>(`select * from miclub.people where club_id=$1 and normalized_dni=$2 for update`, [actor.clubId, input.dni]);
    let person = personResult.rows[0];
    if (person && person.user_id) {
      const linked = await db.query<{ email: string }>(`select email::text from miclub.users where id=$1`, [person.user_id]);
      if (linked.rows[0]?.email.toLowerCase() !== input.email) throw new WorkerMutationError("dni_conflict", "El DNI ya corresponde a otra cuenta dentro del club.");
    }
    const emailOwner = await db.query<{ id: string }>(`select id::text from miclub.users where lower(email::text)=lower($1) for update`, [input.email]);
    if (emailOwner.rows[0]) {
      // A password can neither authenticate nor mutate an existing global identity.
      if (input.password !== undefined) throw new WorkerMutationError("conflict", "No se pudo completar el alta.");
      const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
      if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
      const existingMembership = await db.query(`select 1 from miclub.user_club_memberships where club_id=$1 and user_id=$2`, [actor.clubId, emailOwner.rows[0].id]);
      if (existingMembership.rows[0]) throw new WorkerMutationError("conflict", "No se pudo completar el alta.");
      const token = randomBytes(32).toString("base64url");
      const invitation = (await db.query<{ id: string }>(`insert into miclub.worker_invitations(club_id,user_id,role_id,invited_by,expires_at,token_hash,worker_data) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (club_id,user_id) where status='pending' do update set role_id=excluded.role_id,invited_by=excluded.invited_by,expires_at=excluded.expires_at,token_hash=excluded.token_hash,worker_data=excluded.worker_data,created_at=now() returning id::text`, [actor.clubId, emailOwner.rows[0].id, role.id, actor.userId, new Date(Date.now() + INVITATION_TTL_MS), tokenDigest(token), JSON.stringify({ firstName: input.firstName, lastName: input.lastName, dni: input.dni, phone: input.phone, email: input.email, role: input.role, sectorId: input.sectorId ?? null, hasFixedCompensation: input.hasFixedCompensation, fixedCompensationAmount: input.fixedCompensationAmount, fixedCompensationFrequency: input.fixedCompensationFrequency, employmentStartDate: input.employmentStartDate ?? null, notes: input.notes ?? null })])).rows[0];
      await auditService.sensitiveChange({ action: "worker.invitation.create", result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId, entityType: "worker_invitation", entityId: invitation.id, newData: { issuerUserId: actor.userId, receiverUserId: emailOwner.rows[0].id, clubId: actor.clubId, role: input.role, status: "pending" }, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent }, db);
      // Token delivery is intentionally out-of-band; never put it in API or audit responses.
      return { invitationPending: true };
    }
    if (person) {
      const employee = await db.query(`select 1 from miclub.employees where club_id=$1 and person_id=$2 and archived_at is null`, [actor.clubId, person.id]);
      if (employee.rows[0]) throw new WorkerMutationError("worker_exists", "La persona ya es trabajadora de este club.");
    }
    if (!input.password) throw new WorkerMutationError("invalid_input", "La contraseña es obligatoria para una cuenta nueva.");
    const passwordHash = await hashPassword(input.password);
    const user = (await db.query<{ id: string }>(`insert into miclub.users(email,password_hash,display_name,status,is_active) values($1,$2,$3,'active',true) returning id::text`, [input.email, passwordHash, `${input.firstName} ${input.lastName}`])).rows[0];
    if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [actor.clubId, input.firstName, input.lastName, input.dni, input.phone, input.email, user.id])).rows[0];
    else await db.query(`update miclub.people set user_id=$3,email=$4,phone=coalesce($5,phone),updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, person.id, user.id, input.email, input.phone]);
    const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
    if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
    const membership = (await db.query<{ id: string }>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,$5) returning id::text`, [user.id, actor.clubId, role.id, [...ROLE_DEFAULT_PERMISSIONS[input.role]], input.sectorId ? [input.sectorId] : []])).rows[0];
    const employee = (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,employment_start_date,position,notes,created_by,updated_by) values($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$12) returning *`, [actor.clubId, person.id, user.id, membership.id, input.sectorId ?? null, input.hasFixedCompensation, input.fixedCompensationAmount, input.fixedCompensationFrequency, input.employmentStartDate ?? null, input.role, input.notes ?? null, actor.userId])).rows[0];
    if (input.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set status='activa',updated_at=now()`, [actor.clubId, person.id, `${input.firstName} ${input.lastName}`, input.notes ?? null]);
    await audit(db, actor, "worker.create", String(employee.id), null, employee);
    return employee;
  }, pool);
};

type InvitationRow = { id: string; club_id: string; user_id: string; role_id: string; invited_by: string; expires_at: Date | string; status: string; worker_data: AdministrationWorkerMutationDto };

/** Completes the tenant grant only after the global account owner proves possession of the one-use token. */
export const resolveWorkerInvitation = async (userId: string, token: string, decision: "accept" | "reject", request?: Pick<WorkerActor, "requestId" | "ip" | "userAgent">) => {
  if (!token || token.length > 512) throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
  const pool = await getPostgresPool();
  const result = await withTransaction(async (db) => {
    const invitation = (await db.query<InvitationRow>(`select * from miclub.worker_invitations where token_hash=$1 for update`, [tokenDigest(token)])).rows[0];
    if (!invitation || invitation.user_id !== userId || invitation.status !== "pending") throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await db.query(`update miclub.worker_invitations set status='expired',resolved_at=now() where id=$1`, [invitation.id]);
      return { invalid: true as const };
    }
    if (decision === "reject") {
      await db.query(`update miclub.worker_invitations set status='rejected',resolved_at=now() where id=$1`, [invitation.id]);
      await auditService.sensitiveChange({ action: "worker.invitation.reject", result: "success", userId, clubId: invitation.club_id, entityType: "worker_invitation", entityId: invitation.id, newData: { issuerUserId: invitation.invited_by, receiverUserId: userId, clubId: invitation.club_id, role: invitation.worker_data.role, status: "rejected" }, ...request }, db);
      return { accepted: false };
    }
    const data = invitation.worker_data;
    let person = (await db.query<Record<string, unknown>>(`select * from miclub.people where club_id=$1 and normalized_dni=$2 for update`, [invitation.club_id, data.dni])).rows[0];
    if (person?.user_id && person.user_id !== userId) throw new WorkerMutationError("conflict", "No se pudo completar el alta.");
    if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [invitation.club_id, data.firstName, data.lastName, data.dni, data.phone, data.email, userId])).rows[0];
    else await db.query(`update miclub.people set user_id=$3,email=$4,phone=coalesce($5,phone),updated_at=now() where club_id=$1 and id=$2`, [invitation.club_id, person.id, userId, data.email, data.phone]);
    const membership = (await db.query<{ id: string }>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,$5) returning id::text`, [userId, invitation.club_id, invitation.role_id, [...ROLE_DEFAULT_PERMISSIONS[data.role]], data.sectorId ? [data.sectorId] : []])).rows[0];
    const employee = (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,employment_start_date,position,notes,created_by,updated_by) values($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$12) returning *`, [invitation.club_id, person.id, userId, membership.id, data.sectorId ?? null, data.hasFixedCompensation, data.fixedCompensationAmount, data.fixedCompensationFrequency, data.employmentStartDate ?? null, data.role, data.notes ?? null, invitation.invited_by])).rows[0];
    await db.query(`update miclub.worker_invitations set status='accepted',resolved_at=now(),membership_id=$2 where id=$1`, [invitation.id, membership.id]);
    await auditService.sensitiveChange({ action: "worker.invitation.accept", result: "success", userId, clubId: invitation.club_id, membershipId: membership.id, entityType: "worker_invitation", entityId: invitation.id, newData: { issuerUserId: invitation.invited_by, receiverUserId: userId, clubId: invitation.club_id, role: data.role, status: "accepted" }, ...request }, db);
    return { accepted: true, employee };
  }, pool);
  if ("invalid" in result) throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
  return result;
};

export const updateWorker = async (actor: WorkerActor, id: string, body: unknown) => {
  const input = validateWorkerMutation(body, false); const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (db) => {
    const current = (await db.query<Record<string, unknown>>(`select e.*,r.code as role_code from miclub.employees e left join miclub.user_club_memberships m on m.id=e.membership_id left join miclub.roles r on r.id=m.role_id where e.club_id=$1 and e.id=$2 for update`, [actor.clubId, id])).rows[0];
    if (!current) throw new WorkerMutationError("not_found", "Trabajador inexistente.");
    if (current.role_code === "DIRECTOR" && input.role !== "DIRECTOR") {
      const count = await db.query(`select 1 from miclub.user_club_memberships m join miclub.roles r on r.id=m.role_id where m.club_id=$1 and r.code='DIRECTOR' and m.status='active' and m.id<>$2 limit 1`, [actor.clubId, current.membership_id]);
      if (!count.rows[0]) throw new WorkerMutationError("last_director", "No se puede quitar al último Director activo.");
    }
    const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
    await db.query(`update miclub.user_club_memberships set role_id=$3,permissions=$4,sector_ids=$5,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, current.membership_id, role.id, [...ROLE_DEFAULT_PERMISSIONS[input.role]], input.sectorId ? [input.sectorId] : []]);
    await db.query(`update miclub.people set first_name=$3,last_name=$4,phone=$5,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, current.person_id, input.firstName, input.lastName, input.phone]);
    const after = (await db.query<Record<string, unknown>>(`update miclub.employees set sector_id=$3,has_fixed_compensation=$4,fixed_compensation_amount=$5,fixed_compensation_frequency=$6,employment_start_date=$7,position=$8,notes=$9,updated_by=$10,updated_at=now() where club_id=$1 and id=$2 returning *`, [actor.clubId,id,input.sectorId??null,input.hasFixedCompensation,input.fixedCompensationAmount,input.fixedCompensationFrequency,input.employmentStartDate??null,input.role,input.notes??null,actor.userId])).rows[0];
    await audit(db, actor, "worker.update", id, current, after); return after;
  }, pool);
};

export const archiveWorker = async (actor: WorkerActor, id: string) => {
  const pool = await getPostgresPool(); return withTenantTransaction(actor.clubId, async (db) => {
    const current = (await db.query<Record<string, unknown>>(`select e.*,r.code as role_code from miclub.employees e left join miclub.user_club_memberships m on m.id=e.membership_id left join miclub.roles r on r.id=m.role_id where e.club_id=$1 and e.id=$2 for update`, [actor.clubId,id])).rows[0];
    if (!current) throw new WorkerMutationError("not_found", "Trabajador inexistente.");
    if (current.role_code === "DIRECTOR") { const other = await db.query(`select 1 from miclub.user_club_memberships m join miclub.roles r on r.id=m.role_id where m.club_id=$1 and r.code='DIRECTOR' and m.status='active' and m.id<>$2 limit 1`,[actor.clubId,current.membership_id]); if (!other.rows[0]) throw new WorkerMutationError("last_director", "No se puede archivar al último Director activo."); }
    const after=(await db.query<Record<string,unknown>>(`update miclub.employees set status='archived',archived_at=now(),updated_at=now(),updated_by=$3 where club_id=$1 and id=$2 returning *`,[actor.clubId,id,actor.userId])).rows[0];
    await db.query(`update miclub.user_club_memberships set status='disabled',updated_at=now() where club_id=$1 and id=$2`,[actor.clubId,current.membership_id]); await audit(db,actor,"worker.archive",id,current,after); return after;
  },pool);
};
