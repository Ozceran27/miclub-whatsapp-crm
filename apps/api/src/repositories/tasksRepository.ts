import type { Task, TaskInput, TaskStatus } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type TaskActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
type TaskRow = { id: string; title: string; description: string | null; status: TaskStatus; display_status: Task["displayStatus"]; priority: Task["priority"]; due_at: Date | string | null; completed_at: Date | string | null; assigned_to_user_id: string | null; created_at: Date | string; updated_at: Date | string };
export type TaskResult = { kind: "created" | "updated"; task: Task } | { kind: "missing" | "conflict" | "invalid_assignee" };

const columns = `id, title, description, status, case when due_at < now() and status in ('PENDING','IN_PROGRESS') then 'OVERDUE' else status end display_status,
 priority, due_at, completed_at, assigned_to_user_id, created_at, updated_at`;
const iso = (value: Date | string | null) => value == null ? null : new Date(value).toISOString();
const mapTask = (row: TaskRow): Task => ({ id: row.id, title: row.title, description: row.description, status: row.status, displayStatus: row.display_status,
  priority: row.priority, dueAt: iso(row.due_at), completedAt: iso(row.completed_at), assignedToUserId: row.assigned_to_user_id,
  createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! });

const assigneeIsValid = async (db: QueryExecutor, actor: TaskActor, userId: string | null | undefined) => {
  if (!userId) return true;
  const result = await db.query("select 1 from miclub.user_club_memberships where club_id=$1 and user_id=$2 and status='active'", [actor.clubId, userId]);
  return Boolean(result.rows[0]);
};
const audit = (actor: TaskActor, action: string, before: Task | null, after: Task, db: QueryExecutor) => auditService.sensitiveChange({ action, result: "success", userId: actor.userId,
  membershipId: actor.membershipId, clubId: actor.clubId, entityType: "task", entityId: after.id, requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
  oldData: before as unknown as Record<string, unknown> | null, newData: after as unknown as Record<string, unknown> }, db);

export const listTasks = async (clubId: string): Promise<Task[]> => {
  const db = await getPostgresPool();
  const result = await db.query<TaskRow>(`select ${columns} from miclub.tasks where club_id=$1 and archived_at is null order by due_at nulls last, created_at desc`, [clubId]);
  return result.rows.map(mapTask);
};

export const createTask = async (actor: TaskActor, input: TaskInput): Promise<TaskResult> => withTransaction(async (db) => {
  if (!await assigneeIsValid(db, actor, input.assignedToUserId)) return { kind: "invalid_assignee" };
  const result = await db.query<TaskRow>(`insert into miclub.tasks (club_id,title,description,priority,due_at,assigned_to_user_id,created_by_user_id,created_by_membership_id)
    values ($1,$2,$3,$4,$5,$6::uuid,$7::uuid,$8::uuid) returning ${columns}`,
  [actor.clubId, input.title, input.description ?? null, input.priority ?? "NORMAL", input.dueAt ?? null, input.assignedToUserId ?? null, actor.userId, actor.membershipId]);
  const task = mapTask(result.rows[0]); await audit(actor, "task.create", null, task, db); return { kind: "created", task };
}, await getPostgresPool());

const mutate = async (actor: TaskActor, id: string, updatedAt: string, operation: "update" | "status" | "archive", value: Partial<TaskInput> | TaskStatus = {}): Promise<TaskResult> => withTransaction(async (db) => {
  const current = await db.query<TaskRow>(`select ${columns} from miclub.tasks where club_id=$1 and id=$2 and archived_at is null for update`, [actor.clubId, id]);
  if (!current.rows[0]) return { kind: "missing" };
  const before = mapTask(current.rows[0]); if (before.updatedAt !== new Date(updatedAt).toISOString()) return { kind: "conflict" };
  if (operation === "update" && !await assigneeIsValid(db, actor, (value as Partial<TaskInput>).assignedToUserId)) return { kind: "invalid_assignee" };
  let query: string; let params: unknown[];
  if (operation === "archive") { query = `update miclub.tasks set archived_at=now(),updated_at=now() where club_id=$1 and id=$2 returning ${columns}`; params = [actor.clubId,id]; }
  else if (operation === "status") { query = `update miclub.tasks set status=$3,completed_at=case when $3='COMPLETED' then coalesce(completed_at,now()) else null end,updated_at=now() where club_id=$1 and id=$2 returning ${columns}`; params=[actor.clubId,id,value]; }
  else { const input=value as Partial<TaskInput>; query=`update miclub.tasks set title=coalesce($3,title),description=case when $4::boolean then $5 else description end,priority=coalesce($6,priority),due_at=case when $7::boolean then $8::timestamptz else due_at end,assigned_to_user_id=case when $9::boolean then $10::uuid else assigned_to_user_id end,updated_at=now() where club_id=$1 and id=$2 returning ${columns}`;
    params=[actor.clubId,id,input.title??null,"description" in input,input.description??null,input.priority??null,"dueAt" in input,input.dueAt??null,"assignedToUserId" in input,input.assignedToUserId??null]; }
  const task=mapTask((await db.query<TaskRow>(query,params)).rows[0]); await audit(actor,`task.${operation}`,before,task,db); return { kind:"updated",task };
}, await getPostgresPool());
export const updateTask = (actor: TaskActor,id:string,version:string,input:Partial<TaskInput>) => mutate(actor,id,version,"update",input);
export const setTaskStatus = (actor: TaskActor,id:string,version:string,status:TaskStatus) => mutate(actor,id,version,"status",status);
export const archiveTask = (actor: TaskActor,id:string,version:string) => mutate(actor,id,version,"archive");
