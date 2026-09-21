import { createHash, randomBytes } from "node:crypto";
import { ROLE_DEFAULT_PERMISSIONS, SUPPORTED_OPERATIONAL_CURRENCIES, type AdministrationWorkerMutationDto } from "@miclub/shared";
import { hashPassword } from "../../auth/passwordHasher.js";
import { validatePublicPassword } from "../../auth/registrationService.js";
import { getPostgresPool, type QueryExecutor } from "../../db/postgres.js";
import { withTenantTransaction, withTransaction } from "../../db/transaction.js";
import { auditService } from "../auditService.js";
import { syncEmployeeCompensationTerm } from "../employeeCompensationService.js";

export type WorkerActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export class WorkerMutationError extends Error {
  constructor(public readonly code: "invalid_input" | "conflict" | "dni_conflict" | "worker_exists" | "not_found" | "last_director" | "worker_has_activities" | "invitation_invalid", message: string) { super(message); }
}

export type WorkerInvitationResult = { invitationPending: true };
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

const roles = ["TRABAJADOR", "INSTRUCTOR", "DIRECTOR"] as const;
const cleanText = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
export const validateWorkerMutation = (body: unknown, requirePassword: boolean): AdministrationWorkerMutationDto => {
  const raw = (body && typeof body === "object" ? body : {}) as Partial<AdministrationWorkerMutationDto>;
  const firstName = cleanText(raw.firstName); const lastName = cleanText(raw.lastName);
  const dni = cleanText(raw.dni).replace(/\D/g, "");
  const contactEmail = cleanText(raw.contactEmail ?? raw.email).toLowerCase() || null;
  const accessEmail = cleanText(raw.accessEmail ?? raw.email).toLowerCase() || null;
  const systemAccessEnabled = raw.systemAccessEnabled !== false;
  if (!firstName || !lastName || !/^\d{7,9}$/.test(dni) || !roles.includes(raw.role as typeof roles[number])) throw new WorkerMutationError("invalid_input", "Nombre, apellido, DNI y rol válidos son obligatorios.");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new WorkerMutationError("invalid_input", "El correo de contacto no es válido.");
  if (systemAccessEnabled && (!accessEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail))) throw new WorkerMutationError("invalid_input", "Se requiere un correo de acceso válido cuando el acceso al sistema está activado.");
  if (systemAccessEnabled && (requirePassword || raw.password !== undefined)) {
    try { validatePublicPassword(raw.password); } catch (error) { throw new WorkerMutationError("invalid_input", error instanceof Error ? error.message : "Contraseña inválida."); }
  }
  if (typeof raw.hasFixedCompensation !== "boolean") throw new WorkerMutationError("invalid_input", "hasFixedCompensation debe ser booleano.");
  const amount = raw.fixedCompensationAmount == null ? null : Number(raw.fixedCompensationAmount);
  const frequency = raw.fixedCompensationFrequency ?? null;
  const currencyCode = raw.currencyCode ?? null;
  const validCurrency = SUPPORTED_OPERATIONAL_CURRENCIES.includes(currencyCode as never);
  const validFrequency = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(frequency));
  if ((raw.hasFixedCompensation && (amount == null || !Number.isFinite(amount) || amount < 0 || !validFrequency || !validCurrency)) || (!raw.hasFixedCompensation && (amount !== null || frequency !== null || currencyCode !== null))) throw new WorkerMutationError("invalid_input", "La remuneración fija habilitada exige monto no negativo, frecuencia y moneda; deshabilitada exige los tres valores nulos.");
  return { ...raw, firstName, lastName, dni, email: accessEmail, contactEmail, accessEmail, password: systemAccessEnabled ? raw.password : undefined, systemAccessEnabled, phone: cleanText(raw.phone) || null, role: raw.role, hasFixedCompensation: raw.hasFixedCompensation, fixedCompensationAmount: amount, fixedCompensationFrequency: frequency, currencyCode } as AdministrationWorkerMutationDto;
};

const assertSectorBelongsToClub = async (db: QueryExecutor, clubId: string, sectorId?: string | null) => {
  if (!sectorId) return;
  const sector = await db.query(`select 1 from miclub.sectors where club_id=$1 and id=$2 and archived_at is null`, [clubId, sectorId]);
  if (!sector.rows[0]) throw new WorkerMutationError("invalid_input", "El sector seleccionado no pertenece al club o ya no está disponible.");
};

const audit = (executor: QueryExecutor, actor: WorkerActor, action: string, id: string, oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) => auditService.sensitiveChange({
  action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
  entityType: "employee", entityId: id, oldData, newData, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
}, executor);
const attachPhoto = async (db: QueryExecutor, actor: WorkerActor, employeeId: string, fileId?: string | null) => {
  if (!fileId) return;
  const photo = await db.query(`update miclub.employee_photos set employee_id=$3,status='active',expires_at=null,updated_at=now() where id=$1 and club_id=$2 and status='temporary' and expires_at>now() returning id`, [fileId, actor.clubId, employeeId]);
  if (!photo.rows[0]) throw new WorkerMutationError('invalid_input','La foto temporal no existe, expiró o no pertenece al club.');
  await db.query(`update miclub.employee_photos set status='deleted',deleted_at=now(),updated_at=now() where club_id=$1 and employee_id=$2 and id<>$3 and status='active'`, [actor.clubId, employeeId, fileId]);
};
const reservePhotoForInvitation = async (db: QueryExecutor, actor: WorkerActor, fileId: string | null | undefined, expiresAt: Date) => {
  if (!fileId) return;
  const photo = await db.query(`update miclub.employee_photos set expires_at=$3,updated_at=now() where id=$1 and club_id=$2 and status='temporary' and expires_at>now() returning id`, [fileId, actor.clubId, expiresAt]);
  if (!photo.rows[0]) throw new WorkerMutationError('invalid_input', 'La foto temporal no existe, expiró o no pertenece al club.');
};

export const createWorker = async (actor: WorkerActor, body: unknown): Promise<Record<string, unknown>> => {
  const input = validateWorkerMutation(body, false); const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (db) => {
    await assertSectorBelongsToClub(db, actor.clubId, input.sectorId);
    const personResult = await db.query<Record<string, unknown>>(`select * from miclub.people where club_id=$1 and normalized_dni=$2 for update`, [actor.clubId, input.dni]);
    let person = personResult.rows[0];
    if (person && person.user_id && input.systemAccessEnabled !== false) {
      const linked = await db.query<{ email: string }>(`select email::text from miclub.users where id=$1`, [person.user_id]);
      if (linked.rows[0]?.email.toLowerCase() !== input.accessEmail) throw new WorkerMutationError("dni_conflict", "El DNI ya corresponde a otra cuenta dentro del club.");
    }
    if (person) {
      const employee = await db.query(`select 1 from miclub.employees where club_id=$1 and person_id=$2 and archived_at is null`, [actor.clubId, person.id]);
      if (employee.rows[0]) throw new WorkerMutationError("worker_exists", "La persona ya es trabajadora de este club.");
    }
    if (input.systemAccessEnabled === false) {
      if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email) values($1,$2,$3,$4,$5,$6) returning *`, [actor.clubId, input.firstName, input.lastName, input.dni, input.phone, input.contactEmail])).rows[0];
      else await db.query(`update miclub.people set first_name=$3,last_name=$4,phone=$5,email=$6,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, person.id, input.firstName, input.lastName, input.phone, input.contactEmail]);
      const employee = (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,currency_code,employment_start_date,position,notes,created_by,updated_by) values($1,$2,null,null,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,$11) returning *`, [actor.clubId, person.id, input.sectorId ?? null, input.hasFixedCompensation, input.fixedCompensationAmount, input.fixedCompensationFrequency, input.currencyCode, input.employmentStartDate ?? null, input.role, input.notes ?? null, actor.userId])).rows[0];
      if (input.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set display_name=excluded.display_name,status='activa',updated_at=now()`, [actor.clubId, person.id, `${input.firstName} ${input.lastName}`, input.notes ?? null]);
      await syncEmployeeCompensationTerm(db, actor, String(employee.id), input);
      await attachPhoto(db, actor, String(employee.id), input.photoFileId);
      await audit(db, actor, "worker.create", String(employee.id), null, employee);
      return employee;
    }
    const emailOwner = await db.query<{ id: string }>(`select id::text from miclub.users where lower(email::text)=lower($1) for update`, [input.accessEmail]);
    if (emailOwner.rows[0]) {
      // A password can neither authenticate nor mutate an existing global identity.
      if (input.password !== undefined) throw new WorkerMutationError("conflict", "No se pudo completar el alta.");
      const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
      if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
      const existingMembership = await db.query(`select 1 from miclub.user_club_memberships where club_id=$1 and user_id=$2`, [actor.clubId, emailOwner.rows[0].id]);
      if (existingMembership.rows[0]) throw new WorkerMutationError("conflict", "No se pudo completar el alta.");
      const token = randomBytes(32).toString("base64url");
      const invitationExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
      await reservePhotoForInvitation(db, actor, input.photoFileId, invitationExpiresAt);
      const invitation = (await db.query<{ id: string }>(`insert into miclub.worker_invitations(club_id,user_id,role_id,invited_by,expires_at,token_hash,worker_data) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (club_id,user_id) where status='pending' do update set role_id=excluded.role_id,invited_by=excluded.invited_by,expires_at=excluded.expires_at,token_hash=excluded.token_hash,worker_data=excluded.worker_data,created_at=now() returning id::text`, [actor.clubId, emailOwner.rows[0].id, role.id, actor.userId, invitationExpiresAt, tokenDigest(token), JSON.stringify({ ...input, password: undefined, email: input.accessEmail })])).rows[0];
      await auditService.sensitiveChange({ action: "worker.invitation.create", result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId, entityType: "worker_invitation", entityId: invitation.id, newData: { issuerUserId: actor.userId, receiverUserId: emailOwner.rows[0].id, clubId: actor.clubId, role: input.role, status: "pending" }, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent }, db);
      // Token delivery is intentionally out-of-band; never put it in API or audit responses.
      return { invitationPending: true };
    }
    if (!input.password) throw new WorkerMutationError("invalid_input", "La contraseña es obligatoria para una cuenta nueva.");
    const passwordHash = await hashPassword(input.password);
    const user = (await db.query<{ id: string }>(`insert into miclub.users(email,password_hash,display_name,status,is_active) values($1,$2,$3,'active',true) returning id::text`, [input.accessEmail, passwordHash, `${input.firstName} ${input.lastName}`])).rows[0];
    if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [actor.clubId, input.firstName, input.lastName, input.dni, input.phone, input.contactEmail, user.id])).rows[0];
    else await db.query(`update miclub.people set user_id=$3,email=$4,phone=$5,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, person.id, user.id, input.contactEmail, input.phone]);
    const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
    if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
    const membership = (await db.query<{ id: string }>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,$5) returning id::text`, [user.id, actor.clubId, role.id, [...ROLE_DEFAULT_PERMISSIONS[input.role]], input.sectorId ? [input.sectorId] : []])).rows[0];
    const employee = (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,currency_code,employment_start_date,position,notes,created_by,updated_by) values($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$13,$13) returning *`, [actor.clubId, person.id, user.id, membership.id, input.sectorId ?? null, input.hasFixedCompensation, input.fixedCompensationAmount, input.fixedCompensationFrequency, input.currencyCode, input.employmentStartDate ?? null, input.role, input.notes ?? null, actor.userId])).rows[0];
    if (input.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set status='activa',updated_at=now()`, [actor.clubId, person.id, `${input.firstName} ${input.lastName}`, input.notes ?? null]);
    await syncEmployeeCompensationTerm(db, actor, String(employee.id), input);
    await attachPhoto(db, actor, String(employee.id), input.photoFileId);
    await audit(db, actor, "worker.create", String(employee.id), null, employee);
    return employee;
  }, pool);
};

type InvitationWorkerData = AdministrationWorkerMutationDto & { employeeId?: string };
type InvitationRow = { id: string; club_id: string; user_id: string; role_id: string; invited_by: string; expires_at: Date | string; status: string; worker_data: InvitationWorkerData };

/** Completes the tenant grant only after the global account owner proves possession of the one-use token. */
export const resolveWorkerInvitation = async (userId: string, token: string, decision: "accept" | "reject", request?: Pick<WorkerActor, "requestId" | "ip" | "userAgent">) => {
  if (!token || token.length > 512) throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
  const pool = await getPostgresPool();
  const result = await withTransaction(async (db) => {
    const invitation = token.startsWith('id:')
      ? (await db.query<InvitationRow>(`select * from miclub.worker_invitations where id=$1 for update`, [token.slice(3)])).rows[0]
      : (await db.query<InvitationRow>(`select * from miclub.worker_invitations where token_hash=$1 for update`, [tokenDigest(token)])).rows[0];
    if (!invitation || invitation.user_id !== userId || invitation.status !== "pending") throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
    await db.query("select set_config('app.club_id',$1,true),set_config('app.current_club_id',$1,true)",[invitation.club_id]);
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
    if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [invitation.club_id, data.firstName, data.lastName, data.dni, data.phone, data.contactEmail, userId])).rows[0];
    else await db.query(`update miclub.people set user_id=$3,email=$4,phone=$5,updated_at=now() where club_id=$1 and id=$2`, [invitation.club_id, person.id, userId, data.contactEmail, data.phone]);
    const membership = (await db.query<{ id: string }>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,$5) returning id::text`, [userId, invitation.club_id, invitation.role_id, [...ROLE_DEFAULT_PERMISSIONS[data.role]], data.sectorId ? [data.sectorId] : []])).rows[0];
    const employee = data.employeeId
      ? (await db.query<Record<string, unknown>>(`update miclub.employees set user_id=$3,membership_id=$4,sector_id=$5,status='active',has_fixed_compensation=$6,fixed_compensation_amount=$7,fixed_compensation_frequency=$8,currency_code=$9,employment_start_date=$10,position=$11,notes=$12,updated_by=$13,updated_at=now() where club_id=$1 and id=$2 and person_id=$14 and membership_id is null returning *`, [invitation.club_id,data.employeeId,userId,membership.id,data.sectorId??null,data.hasFixedCompensation,data.fixedCompensationAmount,data.fixedCompensationFrequency,data.currencyCode,data.employmentStartDate??null,data.role,data.notes??null,invitation.invited_by,person.id])).rows[0]
      : (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,has_fixed_compensation,fixed_compensation_amount,fixed_compensation_frequency,currency_code,employment_start_date,position,notes,created_by,updated_by) values($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$13,$13) returning *`, [invitation.club_id, person.id, userId, membership.id, data.sectorId ?? null, data.hasFixedCompensation, data.fixedCompensationAmount, data.fixedCompensationFrequency, data.currencyCode, data.employmentStartDate ?? null, data.role, data.notes ?? null, invitation.invited_by])).rows[0];
    if (!employee) throw new WorkerMutationError('conflict','El trabajador cambió antes de aceptar la invitación.');
    if (data.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set display_name=excluded.display_name,status='activa',updated_at=now()`, [invitation.club_id, person.id, `${data.firstName} ${data.lastName}`, data.notes ?? null]);
    await syncEmployeeCompensationTerm(db, { clubId: invitation.club_id, userId: invitation.invited_by }, String(employee.id), data);
    await attachPhoto(db, { clubId: invitation.club_id, userId: invitation.invited_by, membershipId: membership.id, ...request }, String(employee.id), data.photoFileId);
    await db.query(`update miclub.worker_invitations set status='accepted',resolved_at=now(),membership_id=$2 where id=$1`, [invitation.id, membership.id]);
    await auditService.sensitiveChange({ action: "worker.invitation.accept", result: "success", userId, clubId: invitation.club_id, membershipId: membership.id, entityType: "worker_invitation", entityId: invitation.id, newData: { issuerUserId: invitation.invited_by, receiverUserId: userId, clubId: invitation.club_id, role: data.role, status: "accepted" }, ...request }, db);
    return { accepted: true, employee };
  }, pool);
  if ("invalid" in result) throw new WorkerMutationError("invitation_invalid", "La invitación no es válida.");
  return result;
};

export const listWorkerInvitations = async (userId: string) => {
  const pool=await getPostgresPool();
  return (await pool.query(`select i.id,i.club_id "clubId",'Club '||left(i.club_id::text,8) "clubName",i.worker_data->>'role' role,i.expires_at "expiresAt",i.created_at "createdAt" from miclub.worker_invitations i where i.user_id=$1 and i.status='pending' and i.expires_at>now() order by i.created_at`,[userId])).rows;
};
export const resolveWorkerInvitationById=(userId:string,id:string,decision:'accept'|'reject',request?:Pick<WorkerActor,'requestId'|'ip'|'userAgent'>)=>resolveWorkerInvitation(userId,`id:${id}`,decision,request);

export const updateWorker = async (actor: WorkerActor, id: string, body: unknown) => {
  const input = validateWorkerMutation(body, false); const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (db) => {
    if (!input.updatedAt || Number.isNaN(Date.parse(input.updatedAt))) throw new WorkerMutationError("invalid_input", "La versión del trabajador es obligatoria para guardar cambios.");
    await assertSectorBelongsToClub(db, actor.clubId, input.sectorId);
    const current = (await db.query<Record<string, unknown>>(`select e.*,coalesce(r.code,upper(e.position)) as role_code from miclub.employees e left join miclub.user_club_memberships m on m.id=e.membership_id left join miclub.roles r on r.id=m.role_id where e.club_id=$1 and e.id=$2 for update of e`, [actor.clubId, id])).rows[0];
    if (!current) throw new WorkerMutationError("not_found", "Trabajador inexistente.");
    if (new Date(String(current.updated_at)).getTime() !== new Date(input.updatedAt).getTime()) throw new WorkerMutationError("conflict", "El trabajador fue modificado por otra sesión. Recargue y vuelva a intentar.");
    const duplicateDni = await db.query(`select 1 from miclub.people where club_id=$1 and normalized_dni=$2 and id<>$3 limit 1`, [actor.clubId, input.dni, current.person_id]);
    if (duplicateDni.rows[0]) throw new WorkerMutationError("dni_conflict", "El DNI ya corresponde a otra persona dentro del club.");
    if (current.role_code === "DIRECTOR" && input.role !== "DIRECTOR") {
      const count = await db.query(`select 1 from miclub.user_club_memberships m join miclub.roles r on r.id=m.role_id where m.club_id=$1 and r.code='DIRECTOR' and m.status='active' and m.id<>$2 limit 1`, [actor.clubId, current.membership_id]);
      if (!count.rows[0]) throw new WorkerMutationError("last_director", "No se puede quitar al último Director activo.");
    }
    const instructor = (await db.query<{ id: string }>(`select id::text from miclub.instructors where club_id=$1 and person_id=$2 for update`, [actor.clubId, current.person_id])).rows[0];
    if (current.membership_id) {
      const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
      if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
      await db.query(`update miclub.user_club_memberships set role_id=$3,permissions=$4,sector_ids=$5,status=$6,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, current.membership_id, role.id, [...ROLE_DEFAULT_PERMISSIONS[input.role]], input.sectorId ? [input.sectorId] : [], input.systemAccessEnabled === false ? "disabled" : "active"]);
    } else if (input.systemAccessEnabled !== false) {
      const owner=(await db.query<{id:string}>(`select id::text from miclub.users where lower(email::text)=lower($1) for update`,[input.accessEmail])).rows[0];
      if(!owner) throw new WorkerMutationError('conflict','El correo todavía no tiene una cuenta global. Créela desde un alta nueva o use un correo ya registrado para enviar la invitación.');
      const role=(await db.query<{id:string}>(`select id::text from miclub.roles where club_id=$1 and code=$2`,[actor.clubId,input.role])).rows[0];
      if(!role) throw new WorkerMutationError('invalid_input','El rol solicitado no está aprovisionado en el club.');
      if((await db.query(`select 1 from miclub.user_club_memberships where club_id=$1 and user_id=$2`,[actor.clubId,owner.id])).rows[0]) throw new WorkerMutationError('conflict','La cuenta ya tiene una membresía en este club.');
      const token=randomBytes(32).toString('base64url');
      const invitation=(await db.query<{id:string}>(`insert into miclub.worker_invitations(club_id,user_id,role_id,invited_by,expires_at,token_hash,worker_data) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(club_id,user_id) where status='pending' do update set role_id=excluded.role_id,invited_by=excluded.invited_by,expires_at=excluded.expires_at,token_hash=excluded.token_hash,worker_data=excluded.worker_data,created_at=now() returning id::text`,[actor.clubId,owner.id,role.id,actor.userId,new Date(Date.now()+INVITATION_TTL_MS),tokenDigest(token),JSON.stringify({...input,employeeId:id,password:undefined})])).rows[0];
      await auditService.sensitiveChange({action:'worker.invitation.create',result:'success',userId:actor.userId,membershipId:actor.membershipId,clubId:actor.clubId,entityType:'worker_invitation',entityId:invitation.id,newData:{issuerUserId:actor.userId,receiverUserId:owner.id,clubId:actor.clubId,role:input.role,status:'pending',employeeId:id},requestId:actor.requestId,ip:actor.ip,userAgent:actor.userAgent},db);
    }
    await db.query(`update miclub.people set first_name=$3,last_name=$4,dni=$5,phone=$6,email=$7,updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, current.person_id, input.firstName, input.lastName, input.dni, input.phone, input.contactEmail]);
    const after = (await db.query<Record<string, unknown>>(`update miclub.employees set sector_id=$3,has_fixed_compensation=$4,fixed_compensation_amount=$5,fixed_compensation_frequency=$6,currency_code=$7,employment_start_date=$8,position=$9,notes=$10,updated_by=$11,updated_at=now() where club_id=$1 and id=$2 returning *`, [actor.clubId,id,input.sectorId??null,input.hasFixedCompensation,input.fixedCompensationAmount,input.fixedCompensationFrequency,input.currencyCode,input.employmentStartDate??null,input.role,input.notes??null,actor.userId])).rows[0];
    if (input.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set display_name=excluded.display_name,status='activa',notes=excluded.notes,updated_at=now()`, [actor.clubId, current.person_id, `${input.firstName} ${input.lastName}`, input.notes ?? null]);
    else if (instructor) await db.query(`update miclub.instructors set status='suspendida',updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, instructor.id]);
    await syncEmployeeCompensationTerm(db, actor, id, input);
    await attachPhoto(db, actor, id, input.photoFileId);
    await audit(db, actor, "worker.update", id, current, after); return { ...after, invitationPending: !current.membership_id && input.systemAccessEnabled !== false };
  }, pool);
};

export const archiveWorker = async (actor: WorkerActor, id: string) => {
  const pool = await getPostgresPool(); return withTenantTransaction(actor.clubId, async (db) => {
    const current = (await db.query<Record<string, unknown>>(`select e.*,coalesce(r.code,upper(e.position)) as role_code from miclub.employees e left join miclub.user_club_memberships m on m.id=e.membership_id left join miclub.roles r on r.id=m.role_id where e.club_id=$1 and e.id=$2 for update of e`, [actor.clubId,id])).rows[0];
    if (!current) throw new WorkerMutationError("not_found", "Trabajador inexistente.");
    if (current.role_code === "DIRECTOR") { const other = await db.query(`select 1 from miclub.user_club_memberships m join miclub.roles r on r.id=m.role_id where m.club_id=$1 and r.code='DIRECTOR' and m.status='active' and m.id<>$2 limit 1`,[actor.clubId,current.membership_id]); if (!other.rows[0]) throw new WorkerMutationError("last_director", "No se puede archivar al último Director activo."); }
    const instructor = (await db.query<{ id: string }>(`select id::text from miclub.instructors where club_id=$1 and person_id=$2 for update`, [actor.clubId, current.person_id])).rows[0];
    if ((await db.query(`select 1 from miclub.activities where club_id=$1 and responsible_employee_id=$2 and archived_at is null limit 1`, [actor.clubId, id])).rows[0]) throw new WorkerMutationError("worker_has_activities", "Primero reasigne las actividades vigentes del trabajador.");
    const after=(await db.query<Record<string,unknown>>(`update miclub.employees set status='archived',archived_at=now(),updated_at=now(),updated_by=$3 where club_id=$1 and id=$2 returning *`,[actor.clubId,id,actor.userId])).rows[0];
    if (current.membership_id) await db.query(`update miclub.user_club_memberships set status='disabled',updated_at=now() where club_id=$1 and id=$2`,[actor.clubId,current.membership_id]);
    if (instructor) await db.query(`update miclub.instructors set status='cancelada',updated_at=now() where club_id=$1 and id=$2`, [actor.clubId,instructor.id]);
    await audit(db,actor,"worker.archive",id,current,after); return after;
  },pool);
};
