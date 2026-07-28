import type { ContactedRecentResponse, Member, MessageTemplate, PaginatedHistoryResponse, PreparedMessage, PrepareMessagesValidation } from '@miclub/shared';
import { apiJson } from '../../api';
import type { MessageStatus, Summary, SyncStatus } from '../../modules/CRM/types';

const jsonBody = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const crmApi = {
  members: () => apiJson<Member[]>('/members'), debtors: () => apiJson<Member[]>('/debtors'), templates: () => apiJson<MessageTemplate[]>('/templates'),
  syncStatus: () => apiJson<SyncStatus>('/sync-status'), summary: () => apiJson<Summary>('/summary'), contactedRecent: () => apiJson<ContactedRecentResponse>('/contacted-recent'),
  history: (page = 1) => apiJson<PaginatedHistoryResponse>(`/history?page=${page}&pageSize=20`),
  updateTemplate: (id: string, name: string, body: string) => apiJson<MessageTemplate>(`/templates/${id}`, jsonBody('PATCH', { name, body })),
  createTemplate: (name: string, body: string) => apiJson<MessageTemplate>('/templates', jsonBody('POST', { name, body })),
  deleteTemplate: (id: string) => apiJson<void>(`/templates/${id}`, { method: 'DELETE' }),
  resetTemplates: () => apiJson<MessageTemplate[]>('/templates/reset-defaults', { method: 'POST' }),
  validateMessages: (memberIds: string[], message: string, templateName: string) => apiJson<PrepareMessagesValidation>('/prepare-messages/validate', jsonBody('POST', { memberIds, message, templateName })),
  prepareMessages: (memberIds: string[], message: string, templateName: string) => apiJson<PreparedMessage[]>('/prepare-messages', jsonBody('POST', { memberIds, message, templateName })),
  updateHistoryStatus: (id: number, status: MessageStatus) => apiJson<void>(`/history/${id}/status`, jsonBody('PATCH', { status }))
};
