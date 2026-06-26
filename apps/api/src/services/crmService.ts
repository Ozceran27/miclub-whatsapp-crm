import type { ContactedRecentResponse, MessageTemplate, PaginatedHistoryResponse, PreparedMessage } from "@miclub/shared";
import db from "../lib/sqlite.js";
import * as postgresCrm from "../repositories/crmRepository.js";

export type CrmSource = "sqlite" | "postgres";
export type CrmMigrationPhase = "templates" | "history" | "all";

const sqliteRun = (query: string, params: unknown[] = []): Promise<{ lastID?: number }> =>
  new Promise((resolve, reject) => {
    db.run(query, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID });
    });
  });

const sqliteAll = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows as T[]))));

const sqliteGet = <T>(query: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => db.get(query, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined))));

const getCrmSource = (): CrmSource => (process.env.CRM_SOURCE === "postgres" ? "postgres" : "sqlite");

const mapSqliteTemplate = (row: { id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }): MessageTemplate => ({
  id: row.id,
  name: row.name,
  body: row.body,
  isDefault: row.isDefault === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const auditSqliteCrmData = async () => {
  const tables = await sqliteAll<{ name: string }>("select name from sqlite_master where type='table' and name in ('message_templates','message_history') order by name");
  const templates = tables.some((table) => table.name === "message_templates") ? await sqliteAll<{ total: number; defaults: number }>("select count(*) as total, sum(case when isDefault=1 then 1 else 0 end) as defaults from message_templates") : [{ total: 0, defaults: 0 }];
  const history = tables.some((table) => table.name === "message_history") ? await sqliteAll<{ total: number; unresolvedMemberIds: number }>("select count(*) as total, sum(case when memberId is null or trim(memberId)='' then 1 else 0 end) as unresolvedMemberIds from message_history") : [{ total: 0, unresolvedMemberIds: 0 }];
  return { tables: tables.map((table) => table.name), templates: templates[0], history: history[0], legacyStrategy: "PostgreSQL stores SQLite identifiers in dedicated legacy_sqlite_id columns on crm_message_templates and crm_message_history, with unique constraints for idempotent migrations." };
};

export const listCrmTemplates = async (): Promise<MessageTemplate[]> => {
  if (getCrmSource() === "postgres") return postgresCrm.listTemplates();
  const rows = await sqliteAll<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>("SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates ORDER BY isDefault DESC, datetime(createdAt) ASC");
  return rows.map(mapSqliteTemplate);
};

export const createCrmTemplate = async (name: string, body: string, id: string, now: string): Promise<MessageTemplate | null> => {
  if (getCrmSource() === "postgres") return postgresCrm.upsertTemplate({ id, name, body, isDefault: false, createdAt: now, updatedAt: now, legacySqliteId: null });
  await sqliteRun("INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)", [id, name, body, now, now]);
  return sqliteGet<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>("SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates WHERE id = ?", [id]).then((row) => row ? mapSqliteTemplate(row) : null);
};

export const updateCrmTemplate = async (id: string, name: string, body: string, now: string): Promise<MessageTemplate | null> => {
  if (getCrmSource() === "postgres") return postgresCrm.upsertTemplate({ id, name, body, isDefault: false, createdAt: now, updatedAt: now, legacySqliteId: null });
  const existing = await sqliteGet<{ id: string }>("SELECT id FROM message_templates WHERE id = ?", [id]);
  if (!existing) return null;
  await sqliteRun("UPDATE message_templates SET name = ?, body = ?, updatedAt = ? WHERE id = ?", [name, body, now, id]);
  const row = await sqliteGet<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>("SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates WHERE id = ?", [id]);
  return row ? mapSqliteTemplate(row) : null;
};

export const deleteCrmTemplate = async (id: string): Promise<"missing" | "default" | "deleted"> => {
  if (getCrmSource() === "postgres") { await postgresCrm.deleteTemplate(id); return "deleted"; }
  const existing = await sqliteGet<{ id: string; isDefault: number }>("SELECT id, isDefault FROM message_templates WHERE id = ?", [id]);
  if (!existing) return "missing";
  if (existing.isDefault === 1) return "default";
  await sqliteRun("DELETE FROM message_templates WHERE id = ?", [id]);
  return "deleted";
};

export const replaceCrmDefaultTemplates = async (templates: MessageTemplate[], now: string): Promise<MessageTemplate[]> => {
  const inputs = templates.map((template) => ({ ...template, createdAt: now, updatedAt: now, isDefault: true, legacySqliteId: template.id }));
  if (getCrmSource() === "postgres") return postgresCrm.replaceDefaultTemplates(inputs);
  await sqliteRun("DELETE FROM message_templates");
  for (const template of templates) await sqliteRun("INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)", [template.id, template.name, template.body, now, now]);
  return listCrmTemplates();
};

export const getCrmHistory = async (page: number, pageSize: number): Promise<PaginatedHistoryResponse> => {
  if (getCrmSource() === "postgres") return postgresCrm.getHistory(page, pageSize);
  const [{ total }] = await sqliteAll<{ total: number }>(`SELECT COUNT(*) as total FROM (SELECT id FROM message_history ORDER BY datetime(createdAt) DESC LIMIT 200)`);
  const offset = (page - 1) * pageSize;
  const rows = await sqliteAll<PreparedMessage>(`SELECT id as historyId, memberId, nombre, telefono as phone, mensaje as message, waLink, COALESCE(status, estado, 'prepared') as status, createdAt, openedAt, sentAt, note, templateName FROM (SELECT * FROM message_history ORDER BY datetime(createdAt) DESC LIMIT 200) ORDER BY datetime(createdAt) DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
  return { items: rows, page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
};

export const getCrmContactedRecent = async (since: string, windowDays: number): Promise<ContactedRecentResponse> => {
  if (getCrmSource() === "postgres") return postgresCrm.getContactedRecent(since, windowDays);
  const rows = await sqliteAll<{ memberId: string; eventAt: string }>(`SELECT memberId, COALESCE(sentAt, createdAt) as eventAt FROM message_history WHERE COALESCE(status, estado) = 'sent_manual' AND datetime(COALESCE(sentAt, createdAt)) >= datetime(?) ORDER BY datetime(COALESCE(sentAt, createdAt)) DESC`, [since]);
  const byMemberId: ContactedRecentResponse["byMemberId"] = {};
  for (const row of rows) if (!byMemberId[row.memberId]) byMemberId[row.memberId] = { lastSentAt: row.eventAt, count: 1 }; else byMemberId[row.memberId].count += 1;
  return { windowDays, since, memberIds: Object.keys(byMemberId), byMemberId };
};

export const findCrmDuplicatePreparedMessages = async (memberIds: string[]) => getCrmSource() === "postgres" ? postgresCrm.findDuplicatePreparedMessages(memberIds) : sqliteAll<{ memberId: string; nombre: string; status: string; createdAt: string }>(`SELECT memberId, nombre, COALESCE(status, estado, 'prepared') as status, createdAt FROM message_history WHERE memberId IN (${memberIds.map(()=>'?').join(',')}) AND COALESCE(status, estado) IN ('prepared','opened','sent_manual') ORDER BY datetime(createdAt) DESC`, memberIds);

export const insertCrmHistory = async (history: Omit<PreparedMessage, "historyId">): Promise<PreparedMessage> => {
  if (getCrmSource() === "postgres") return postgresCrm.insertHistory(history);
  const result = await sqliteRun("INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, status, createdAt, templateName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [history.memberId, history.nombre, history.phone, history.message, history.waLink, "prepared", history.status ?? "prepared", history.createdAt, history.templateName ?? null]);
  return { ...history, historyId: result.lastID };
};

export const updateCrmHistoryStatus = async (id: number, status: NonNullable<PreparedMessage["status"]>, note?: string | null): Promise<PreparedMessage | null> => {
  if (getCrmSource() === "postgres") return postgresCrm.updateHistoryStatus(id, status, note);
  const existing = await sqliteGet<{ id: number }>("SELECT id FROM message_history WHERE id = ?", [id]);
  if (!existing) return null;
  const now = new Date().toISOString();
  await sqliteRun("UPDATE message_history SET status = ?, openedAt = COALESCE(?, openedAt), sentAt = COALESCE(?, sentAt), note = COALESCE(?, note) WHERE id = ?", [status, status === "opened" ? now : null, status === "sent_manual" ? now : null, note ?? null, id]);
  return sqliteGet<PreparedMessage>(`SELECT id as historyId, memberId, nombre, telefono as phone, mensaje as message, waLink, COALESCE(status, estado, 'prepared') as status, createdAt, openedAt, sentAt, note, templateName FROM message_history WHERE id = ?`, [id]).then((row) => row ?? null);
};

export const migrateCrmToPostgres = async ({ dryRun, phase }: { dryRun: boolean; phase: CrmMigrationPhase }) => {
  const audit = await auditSqliteCrmData();
  const report = { dryRun, phase, audit, templates: { read: 0, migrated: 0 }, history: { read: 0, migrated: 0, unresolved: [] as Array<{ legacySqliteId: number; memberId: string }> } };
  await postgresCrm.ensureCrmSchema();
  if (phase === "templates" || phase === "all") {
    const rows = await sqliteAll<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>("select * from message_templates order by datetime(createdAt) asc");
    report.templates.read = rows.length;
    if (!dryRun) for (const row of rows) { await postgresCrm.upsertTemplate({ id: row.id, legacySqliteId: row.id, name: row.name, body: row.body, isDefault: row.isDefault === 1, createdAt: row.createdAt, updatedAt: row.updatedAt }); report.templates.migrated += 1; }
  }
  if (phase === "history" || phase === "all") {
    const rows = await sqliteAll<{ id: number; memberId: string; nombre: string; telefono: string; mensaje: string; waLink: string; status: string; estado: string; createdAt: string; openedAt?: string | null; sentAt?: string | null; note?: string | null; templateName?: string | null }>("select * from message_history order by id asc");
    report.history.read = rows.length;
    for (const row of rows) {
      const links = await postgresCrm.resolvePostgresCrmLinks(row.memberId, row.telefono);
      if (!links.personId && !links.enrollmentId) report.history.unresolved.push({ legacySqliteId: row.id, memberId: row.memberId });
      if (!dryRun) { await postgresCrm.insertHistory({ legacySqliteId: row.id, memberId: row.memberId, personId: links.personId, enrollmentId: links.enrollmentId, nombre: row.nombre, phone: row.telefono, message: row.mensaje, waLink: row.waLink, status: (row.status ?? row.estado ?? "prepared") as NonNullable<PreparedMessage["status"]>, createdAt: row.createdAt, openedAt: row.openedAt ?? null, sentAt: row.sentAt ?? null, note: row.note ?? null, templateName: row.templateName ?? null }); report.history.migrated += 1; }
    }
  }
  return report;
};
