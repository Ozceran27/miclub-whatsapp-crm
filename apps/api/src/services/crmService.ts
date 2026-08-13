import type { MessageTemplate, PreparedMessage } from "@miclub/shared";
import * as postgresCrm from "../repositories/crmRepository.js";

/** Productive CRM is deliberately PostgreSQL-only. SQLite migration tooling lives outside the runtime graph. */
export const resolveCrmSource = (_configuredSource?: string): "postgres" => "postgres";
export const getCrmSource = (): "postgres" => "postgres";

export const listCrmTemplates = postgresCrm.listTemplates;
export const createCrmTemplate = (clubId: string, name: string, body: string, id: string, now: string) =>
  postgresCrm.upsertTemplate(clubId, { id, name, body, isDefault: false, createdAt: now, updatedAt: now, legacySqliteId: null });
export const updateCrmTemplate = (clubId: string, id: string, name: string, body: string, now: string) =>
  postgresCrm.upsertTemplate(clubId, { id, name, body, isDefault: false, createdAt: now, updatedAt: now, legacySqliteId: null });
export const deleteCrmTemplate = postgresCrm.archiveTemplate;
export const replaceCrmDefaultTemplates = (clubId: string, templates: MessageTemplate[], now: string) =>
  postgresCrm.replaceDefaultTemplates(clubId, templates.map((template) => ({ ...template, createdAt: now, updatedAt: now, isDefault: true, legacySqliteId: template.id })));
export const getCrmHistory = postgresCrm.getHistory;
export const getCrmContactedRecent = postgresCrm.getContactedRecent;
export const findCrmDuplicatePreparedMessages = postgresCrm.findDuplicatePreparedMessages;
export const insertCrmHistory = (clubId: string, history: Omit<PreparedMessage, "historyId">) => postgresCrm.insertHistory(clubId, history);
export const updateCrmHistoryStatus = postgresCrm.updateHistoryStatus;
