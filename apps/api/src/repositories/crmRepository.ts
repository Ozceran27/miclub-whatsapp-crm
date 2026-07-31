import type { ContactedRecentResponse, MessageTemplate, PaginatedHistoryResponse, PreparedMessage } from "@miclub/shared";
import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

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
  const result = await pool.query<{ ready: boolean }>(
    `select to_regclass('miclub.crm_message_templates') is not null
        and exists (select 1 from information_schema.columns where table_schema='miclub' and table_name='crm_message_templates' and column_name='club_id') as ready`
  );
  if (!result.rows[0]?.ready) throw new Error("La migración tenant de CRM no fue aplicada.");
};

export const listTemplates = async (clubId: string): Promise<MessageTemplate[]> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(`select * from miclub.crm_message_templates where club_id=$1 and archived_at is null order by is_default desc, created_at asc`, [clubId]);
  return result.rows.map(mapTemplate);
};

export const upsertTemplate = async (clubId: string, template: TemplateInput): Promise<MessageTemplate> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<Record<string, unknown>>(
    `insert into miclub.crm_message_templates (club_id, id, legacy_sqlite_id, name, body, is_default, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (club_id, id) do update set name=excluded.name, body=excluded.body, is_default=excluded.is_default, updated_at=excluded.updated_at
     returning *`,
    [clubId, template.id, template.legacySqliteId ?? template.id, template.name, template.body, template.isDefault, template.createdAt, template.updatedAt]
  );
  return mapTemplate(result.rows[0]);
};

export const archiveTemplate = async (clubId: string, id: string, userId: string | null): Promise<"missing" | "default" | "deleted"> => {
  await ensureCrmSchema();
  return withTransaction(async (executor) => {
    const before = await executor.query<Record<string, unknown>>(
      `select * from miclub.crm_message_templates where club_id=$1 and id=$2 and archived_at is null for update`, [clubId, id],
    );
    if (!before.rows[0]) return "missing";
    if (before.rows[0].is_default === true) return "default";
    const after = await executor.query<Record<string, unknown>>(
      `update miclub.crm_message_templates set archived_at=now(), archived_by=$3::uuid, updated_at=now()
        where club_id=$1 and id=$2 returning *`, [clubId, id, userId],
    );
    await auditService.sensitiveChange({
      action: "crm.template.archive", result: "success", userId, clubId,
      entityType: "crm_message_template", entityId: null,
      oldData: before.rows[0], newData: after.rows[0], metadata: { templateId: id },
    }, executor);
    return "deleted";
  });
};

export const replaceDefaultTemplates = async (clubId: string, templates: TemplateInput[]): Promise<MessageTemplate[]> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  await withTransaction(async (executor) => {
    await executor.query("update miclub.crm_message_templates set archived_at=now(), updated_at=now() where club_id=$1 and is_default=true and archived_at is null", [clubId]);
    for (const template of templates) {
      await executor.query(
        `insert into miclub.crm_message_templates (club_id,id,legacy_sqlite_id,name,body,is_default,created_at,updated_at,archived_at,archived_by)
         values ($1,$2,$3,$4,$5,true,$6,$7,null,null)
         on conflict (club_id,id) do update set name=excluded.name,body=excluded.body,is_default=true,updated_at=excluded.updated_at,archived_at=null,archived_by=null`,
        [clubId, template.id, template.legacySqliteId ?? template.id, template.name, template.body, template.createdAt, template.updatedAt],
      );
    }
  }, pool);
  return listTemplates(clubId);
};

export const getHistory = async (clubId: string, page: number, pageSize: number): Promise<PaginatedHistoryResponse> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const offset = (page - 1) * pageSize;
  const count = await pool.query<{ total: string }>(`select count(*) as total from (select id from miclub.crm_message_history where club_id=$1 order by created_at desc limit 200) recent`, [clubId]);
  const rows = await pool.query<Record<string, unknown>>(`select * from (select * from miclub.crm_message_history where club_id=$1 order by created_at desc limit 200) recent order by created_at desc limit $2 offset $3`, [clubId, pageSize, offset]);
  const total = Number(count.rows[0]?.total ?? 0);
  return { items: rows.rows.map(mapHistory), page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
};

export const findDuplicatePreparedMessages = async (clubId: string, memberIds: string[]): Promise<Array<{ memberId: string; nombre: string; status: string; createdAt: string }>> => {
  if (memberIds.length === 0) return [];
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<{ member_id: string; nombre: string; status: string; created_at: string }>(
    `select member_id, coalesce(nombre, '') as nombre, status, created_at from miclub.crm_message_history where club_id=$1 and member_id = any($2) and status in ('prepared','opened','sent_manual') order by created_at desc`,
    [clubId, memberIds]
  );
  return result.rows.map((row) => ({ memberId: row.member_id, nombre: row.nombre, status: row.status, createdAt: new Date(row.created_at).toISOString() }));
};

export const insertHistory = async (clubId: string, history: HistoryInput): Promise<PreparedMessage> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const commonValues = [clubId, history.memberId, history.personId ?? null, history.enrollmentId ?? null, history.nombre ?? null, history.phone, history.message, history.waLink, history.status ?? "prepared", history.createdAt, history.openedAt ?? null, history.sentAt ?? null, history.note ?? null, history.templateName ?? null];

  // legacy_sqlite_id has a database sequence default. A normal application
  // insert must omit the column: explicitly sending NULL bypasses PostgreSQL's
  // default and violates the NOT NULL constraint. Legacy migrations still
  // supply the original id and retain their idempotent upsert behaviour.
  if (history.legacySqliteId == null) {
    const result = await pool.query<Record<string, unknown>>(
      `insert into miclub.crm_message_history (club_id, member_id, person_id, enrollment_id, nombre, phone, message, wa_link, status, created_at, opened_at, sent_at, note, template_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      commonValues
    );
    return mapHistory(result.rows[0]);
  }

  const result = await pool.query<Record<string, unknown>>(
    `insert into miclub.crm_message_history (club_id, legacy_sqlite_id, member_id, person_id, enrollment_id, nombre, phone, message, wa_link, status, created_at, opened_at, sent_at, note, template_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (club_id, legacy_sqlite_id) do update set status=excluded.status, opened_at=excluded.opened_at, sent_at=excluded.sent_at, note=excluded.note
     returning *`,
    [clubId, history.legacySqliteId, ...commonValues.slice(1)]
  );
  return mapHistory(result.rows[0]);
};

export const updateHistoryStatus = async (clubId: string, id: number, status: MessageStatus, note?: string | null): Promise<PreparedMessage | null> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const now = new Date().toISOString();
  const result = await pool.query<Record<string, unknown>>(
    `update miclub.crm_message_history set status=$3, opened_at=coalesce($4, opened_at), sent_at=coalesce($5, sent_at), note=coalesce($6, note) where club_id=$1 and (legacy_sqlite_id=$2 or id::text=$2::text) returning *`,
    [clubId, id, status, status === "opened" ? now : null, status === "sent_manual" ? now : null, note ?? null]
  );
  return result.rows[0] ? mapHistory(result.rows[0]) : null;
};

export const getContactedRecent = async (clubId: string, since: string, until: string, windowDays: number): Promise<ContactedRecentResponse> => {
  await ensureCrmSchema();
  const pool = await getPostgresPool();
  const result = await pool.query<{ member_id: string; event_at: string }>(`select member_id, coalesce(sent_at, created_at) as event_at from miclub.crm_message_history where club_id=$1 and status='sent_manual' and coalesce(sent_at, created_at) >= $2::timestamptz and coalesce(sent_at, created_at) < $3::timestamptz order by coalesce(sent_at, created_at) desc`, [clubId, since, until]);
  const byMemberId: ContactedRecentResponse["byMemberId"] = {};
  for (const row of result.rows) {
    const existing = byMemberId[row.member_id];
    if (!existing) byMemberId[row.member_id] = { lastSentAt: new Date(row.event_at).toISOString(), count: 1 };
    else existing.count += 1;
  }
  return { windowDays, since, memberIds: Object.keys(byMemberId), byMemberId };
};

export const resolvePostgresCrmLinks = async (clubId: string, memberId: string, phone: string): Promise<{ personId: string | null; enrollmentId: string | null }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ person_id: string | null; enrollment_id: string | null }>(
    `select p.id as person_id, e.id as enrollment_id
     from miclub.people p
     left join miclub.enrollments e on e.person_id = p.id and e.club_id = $1 and (e.external_id = $2 or e.id::text = $2)
     where p.club_id = $1 and (p.id::text = $2 or p.normalized_phone = $3 or p.phone = $4)
     order by e.updated_at desc nulls last
     limit 1`,
    [clubId, memberId, phone.replace(/\D/g, ""), phone]
  );
  return { personId: result.rows[0]?.person_id ?? null, enrollmentId: result.rows[0]?.enrollment_id ?? null };
};
