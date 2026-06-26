import type { ContactedRecentResponse, MessageTemplate, PaginatedHistoryResponse, PreparedMessage } from "@miclub/shared";
import { getPostgresPool } from "../db/postgres.js";

export type MessageStatus = NonNullable<PreparedMessage["status"]>;
export type TemplateInput = Pick<MessageTemplate, "id" | "name" | "body" | "createdAt" | "updatedAt"> & { isDefault: boolean; legacySqliteId?: string | null };
export type HistoryInput = Omit<PreparedMessage, "historyId" | "phone" | "message"> & { phone: string; message: string; legacySqliteId?: number | null; personId?: string | null; enrollmentId?: string | null };

const mapTemplate = (row: Record<string, unknown>): MessageTemplate => ({
  id: String(row.id),
  name: String(row.name),
  body: String(row.body),
  isDefault: row.is_default === true,
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const mapHistory = (row: Record<string, unknown>): PreparedMessage => ({
  historyId: Number(row.legacy_sqlite_id ?? row.id),
  memberId: String(row.member_id),
  nombre: row.nombre ? String(row.nombre) : undefined,
  phone: String(row.phone),
  message: String(row.message),
  waLink: String(row.wa_link),
  status: String(row.status) as MessageStatus,
  createdAt: new Date(String(row.created_at)).toISOString(),
  openedAt: row.opened_at ? new Date(String(row.opened_at)).toISOString() : null,
  sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
  note: row.note ? String(row.note) : null,
  templateName: row.template_name ? String(row.template_name) : null
});

export const ensureCrmSchema = async (): Promise<void> => {
  const pool = await getPostgresPool();
  await pool.query(`
    create table if not exists miclub.crm_message_templates (
      id text primary key,
      legacy_sqlite_id text unique,
      name text not null,
      body text not null,
      is_default boolean not null default false,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )
  `);
  await pool.query(`
    create table if not exists miclub.crm_message_history (
      id bigserial primary key,
      legacy_sqlite_id integer unique,
      member_id text not null,
      person_id uuid references miclub.people(id),
      enrollment_id uuid references miclub.enrollments(id),
      nombre text,
      phone text not null,
      message text not null,
      wa_link text not null,
      status text not null default 'prepared',
      created_at timestamptz not null,
      opened_at timestamptz,
      sent_at timestamptz,
      note text,
      template_name text
    )
  `);
};

export const listTemplates = async (): Promise<MessageTemplate[]> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(`select * from miclub.crm_message_templates order by is_default desc, created_at asc`);
  return result.rows.map(mapTemplate);
};

export const upsertTemplate = async (template: TemplateInput): Promise<MessageTemplate> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(
    `insert into miclub.crm_message_templates (id, legacy_sqlite_id, name, body, is_default, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (id) do update set name=excluded.name, body=excluded.body, is_default=excluded.is_default, updated_at=excluded.updated_at
     returning *`,
    [template.id, template.legacySqliteId ?? template.id, template.name, template.body, template.isDefault, template.createdAt, template.updatedAt]
  );
  return mapTemplate(result.rows[0]);
};

export const deleteTemplate = async (id: string): Promise<void> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  await pool.query(`delete from miclub.crm_message_templates where id=$1`, [id]);
};

export const replaceDefaultTemplates = async (templates: TemplateInput[]): Promise<MessageTemplate[]> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  await pool.query("delete from miclub.crm_message_templates");
  for (const template of templates) await upsertTemplate(template);
  return listTemplates();
};

export const getHistory = async (page: number, pageSize: number): Promise<PaginatedHistoryResponse> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const offset = (page - 1) * pageSize;
  const count = await pool.query<{ total: string }>(`select count(*) as total from (select id from miclub.crm_message_history order by created_at desc limit 200) recent`);
  const rows = await pool.query<Record<string, unknown>>(`select * from (select * from miclub.crm_message_history order by created_at desc limit 200) recent order by created_at desc limit $1 offset $2`, [pageSize, offset]);
  const total = Number(count.rows[0]?.total ?? 0);
  return { items: rows.rows.map(mapHistory), page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
};

export const findDuplicatePreparedMessages = async (memberIds: string[]): Promise<Array<{ memberId: string; nombre: string; status: string; createdAt: string }>> => {
  if (memberIds.length === 0) return [];
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<{ member_id: string; nombre: string; status: string; created_at: string }>(
    `select member_id, coalesce(nombre, '') as nombre, status, created_at from miclub.crm_message_history where member_id = any($1) and status in ('prepared','opened','sent_manual') order by created_at desc`,
    [memberIds]
  );
  return result.rows.map((row) => ({ memberId: row.member_id, nombre: row.nombre, status: row.status, createdAt: new Date(row.created_at).toISOString() }));
};

export const insertHistory = async (history: HistoryInput): Promise<PreparedMessage> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(
    `insert into miclub.crm_message_history (legacy_sqlite_id, member_id, person_id, enrollment_id, nombre, phone, message, wa_link, status, created_at, opened_at, sent_at, note, template_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (legacy_sqlite_id) do update set status=excluded.status, opened_at=excluded.opened_at, sent_at=excluded.sent_at, note=excluded.note
     returning *`,
    [history.legacySqliteId ?? null, history.memberId, history.personId ?? null, history.enrollmentId ?? null, history.nombre ?? null, history.phone, history.message, history.waLink, history.status ?? "prepared", history.createdAt, history.openedAt ?? null, history.sentAt ?? null, history.note ?? null, history.templateName ?? null]
  );
  return mapHistory(result.rows[0]);
};

export const updateHistoryStatus = async (id: number, status: MessageStatus, note?: string | null): Promise<PreparedMessage | null> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const now = new Date().toISOString();
  const result = await pool.query<Record<string, unknown>>(
    `update miclub.crm_message_history set status=$2, opened_at=coalesce($3, opened_at), sent_at=coalesce($4, sent_at), note=coalesce($5, note) where legacy_sqlite_id=$1 or id=$1 returning *`,
    [id, status, status === "opened" ? now : null, status === "sent_manual" ? now : null, note ?? null]
  );
  return result.rows[0] ? mapHistory(result.rows[0]) : null;
};

export const getContactedRecent = async (since: string, windowDays: number): Promise<ContactedRecentResponse> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<{ member_id: string; event_at: string }>(`select member_id, coalesce(sent_at, created_at) as event_at from miclub.crm_message_history where status='sent_manual' and coalesce(sent_at, created_at) >= $1 order by coalesce(sent_at, created_at) desc`, [since]);
  const byMemberId: ContactedRecentResponse["byMemberId"] = {};
  for (const row of result.rows) {
    const existing = byMemberId[row.member_id];
    if (!existing) byMemberId[row.member_id] = { lastSentAt: new Date(row.event_at).toISOString(), count: 1 };
    else existing.count += 1;
  }
  return { windowDays, since, memberIds: Object.keys(byMemberId), byMemberId };
};

export const resolvePostgresCrmLinks = async (memberId: string, phone: string): Promise<{ personId: string | null; enrollmentId: string | null }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ person_id: string | null; enrollment_id: string | null }>(
    `select p.id as person_id, e.id as enrollment_id
     from miclub.people p
     left join miclub.enrollments e on e.person_id = p.id and (e.external_id = $1 or e.id::text = $1)
     where p.id::text = $1 or p.normalized_phone = $2 or p.phone = $3
     order by e.updated_at desc nulls last
     limit 1`,
    [memberId, phone.replace(/\D/g, ""), phone]
  );
  return { personId: result.rows[0]?.person_id ?? null, enrollmentId: result.rows[0]?.enrollment_id ?? null };
};
