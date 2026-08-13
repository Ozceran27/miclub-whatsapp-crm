import { ROLE_DEFAULT_PERMISSIONS, type AdministrationWorkerMutationDto } from "@miclub/shared";
import { hashPassword } from "../../auth/passwordHasher.js";
import { validatePublicPassword } from "../../auth/registrationService.js";
import { getPostgresPool, type QueryExecutor } from "../../db/postgres.js";
import { withTenantTransaction } from "../../db/transaction.js";
import { auditService } from "../auditService.js";

export type WorkerActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export class WorkerMutationError extends Error {
  constructor(public readonly code: "invalid_input" | "email_exists" | "dni_conflict" | "worker_exists" | "not_found" | "last_director", message: string) { super(message); }
}

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
  if (raw.paymentMode !== "FIXED" && raw.paymentMode !== "VARIABLE") throw new WorkerMutationError("invalid_input", "paymentMode debe ser FIXED o VARIABLE.");
  const amount = raw.monthlyFixedAmount == null ? null : Number(raw.monthlyFixedAmount);
  if ((raw.paymentMode === "FIXED" && (amount == null || !Number.isFinite(amount) || amount < 0)) || (raw.paymentMode === "VARIABLE" && amount !== null)) throw new WorkerMutationError("invalid_input", "FIXED exige monto no negativo y VARIABLE exige monto nulo.");
  return { ...raw, firstName, lastName, dni, email, phone: cleanText(raw.phone) || null, role: raw.role, paymentMode: raw.paymentMode, monthlyFixedAmount: amount } as AdministrationWorkerMutationDto;
};

const audit = (executor: QueryExecutor, actor: WorkerActor, action: string, id: string, oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) => auditService.sensitiveChange({
  action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
  entityType: "employee", entityId: id, oldData, newData, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
}, executor);

export const createWorker = async (actor: WorkerActor, body: unknown): Promise<Record<string, unknown>> => {
  const input = validateWorkerMutation(body, true); const passwordHash = await hashPassword(input.password!); const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (db) => {
    const personResult = await db.query<Record<string, unknown>>(`select * from miclub.people where club_id=$1 and normalized_dni=$2 for update`, [actor.clubId, input.dni]);
    let person = personResult.rows[0];
    if (person && person.user_id) {
      const linked = await db.query<{ email: string }>(`select email::text from miclub.users where id=$1`, [person.user_id]);
      if (linked.rows[0]?.email.toLowerCase() !== input.email) throw new WorkerMutationError("dni_conflict", "El DNI ya corresponde a otra cuenta dentro del club.");
    }
    const emailOwner = await db.query<{ id: string }>(`select id::text from miclub.users where lower(email::text)=lower($1) for update`, [input.email]);
    if (emailOwner.rows[0] && (!person || person.user_id !== emailOwner.rows[0].id)) throw new WorkerMutationError("email_exists", "Ya existe una cuenta global con ese correo electrónico.");
    if (person) {
      const employee = await db.query(`select 1 from miclub.employees where club_id=$1 and person_id=$2 and archived_at is null`, [actor.clubId, person.id]);
      if (employee.rows[0]) throw new WorkerMutationError("worker_exists", "La persona ya es trabajadora de este club.");
    }
    const user = emailOwner.rows[0] ?? (await db.query<{ id: string }>(`insert into miclub.users(email,password_hash,display_name,status,is_active) values($1,$2,$3,'active',true) returning id::text`, [input.email, passwordHash, `${input.firstName} ${input.lastName}`])).rows[0];
    if (!person) person = (await db.query<Record<string, unknown>>(`insert into miclub.people(club_id,first_name,last_name,dni,phone,email,user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [actor.clubId, input.firstName, input.lastName, input.dni, input.phone, input.email, user.id])).rows[0];
    else await db.query(`update miclub.people set user_id=$3,email=$4,phone=coalesce($5,phone),updated_at=now() where club_id=$1 and id=$2`, [actor.clubId, person.id, user.id, input.email, input.phone]);
    const role = (await db.query<{ id: string }>(`select id::text from miclub.roles where club_id=$1 and code=$2`, [actor.clubId, input.role])).rows[0];
    if (!role) throw new WorkerMutationError("invalid_input", "El rol solicitado no está aprovisionado en el club.");
    const membership = (await db.query<{ id: string }>(`insert into miclub.user_club_memberships(user_id,club_id,role_id,permissions,sector_ids) values($1,$2,$3,$4,$5) returning id::text`, [user.id, actor.clubId, role.id, [...ROLE_DEFAULT_PERMISSIONS[input.role]], input.sectorId ? [input.sectorId] : []])).rows[0];
    const employee = (await db.query<Record<string, unknown>>(`insert into miclub.employees(club_id,person_id,user_id,membership_id,sector_id,status,payment_mode,monthly_fixed_amount,employment_start_date,position,notes,created_by,updated_by) values($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$11) returning *`, [actor.clubId, person.id, user.id, membership.id, input.sectorId ?? null, input.paymentMode, input.monthlyFixedAmount ?? null, input.employmentStartDate ?? null, input.role, input.notes ?? null, actor.userId])).rows[0];
    if (input.role === "INSTRUCTOR") await db.query(`insert into miclub.instructors(club_id,person_id,display_name,status,notes) values($1,$2,$3,'activa',$4) on conflict (club_id,person_id) do update set status='activa',updated_at=now()`, [actor.clubId, person.id, `${input.firstName} ${input.lastName}`, input.notes ?? null]);
    await audit(db, actor, "worker.create", String(employee.id), null, employee);
    return employee;
  }, pool);
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
    const after = (await db.query<Record<string, unknown>>(`update miclub.employees set sector_id=$3,payment_mode=$4,monthly_fixed_amount=$5,employment_start_date=$6,position=$7,notes=$8,updated_by=$9,updated_at=now() where club_id=$1 and id=$2 returning *`, [actor.clubId,id,input.sectorId??null,input.paymentMode,input.monthlyFixedAmount??null,input.employmentStartDate??null,input.role,input.notes??null,actor.userId])).rows[0];
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
