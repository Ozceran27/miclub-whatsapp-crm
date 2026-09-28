import type { CrmDebtPage, CrmDebtSummary, CrmMoney, MessageTemplate, PaginatedHistoryResponse, PreparedMessage, PrepareMessagesValidation } from '@miclub/shared';
import { apiJson } from '../../api';
import type { MessageStatus } from '../../modules/CRM/types';

const jsonBody = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export type CrmCatalogItem={sectorId:string;sectorName:string;activityId:string;activityName:string};
export type DebtFilters={kind:'overdue'|'review'|'all';page:number;query:string;sectorId:string;activityId:string};
const path=(suffix:string)=>`/api/crm${suffix}` as `/${string}`;
export const crmApi = {
  debts: (filter:DebtFilters)=>apiJson<CrmDebtPage>(path(`/debts?${new URLSearchParams({kind:filter.kind,page:String(filter.page),query:filter.query,...(filter.sectorId?{sectorId:filter.sectorId}:{}),...(filter.activityId?{activityId:filter.activityId}:{})})}`)),
  debtSummary: ()=>apiJson<CrmDebtSummary>(path('/debt-summary')),
  catalog: ()=>apiJson<CrmCatalogItem[]>(path('/catalog')),
  eligibility: (id:string)=>apiJson<{eligible:boolean;phone:string|null;balances:CrmMoney[];overdueCount:number}>(path(`/eligibility/${id}`)),
  templates: () => apiJson<MessageTemplate[]>(path('/templates')),
  prepared: (page=1)=>apiJson<PaginatedHistoryResponse>(path(`/prepared?page=${page}`)),
  history: (page=1)=>apiJson<PaginatedHistoryResponse>(path(`/history?page=${page}&pageSize=20`)),
  updateTemplate: (id:string,name:string,body:string)=>apiJson<MessageTemplate>(path(`/templates/${id}`),jsonBody('PATCH',{name,body})),
  createTemplate: (name:string,body:string)=>apiJson<MessageTemplate>(path('/templates'),jsonBody('POST',{name,body})),
  deleteTemplate: (id:string)=>apiJson<void>(path(`/templates/${id}`),{method:'DELETE'}),
  resetTemplates: ()=>apiJson<MessageTemplate[]>(path('/templates/reset-defaults'),{method:'POST'}),
  validateMessages: (memberIds:string[],message:string,templateName:string)=>apiJson<PrepareMessagesValidation>(path('/prepare-messages/validate'),jsonBody('POST',{memberIds,message,templateName})),
  prepareMessages: (memberIds:string[],message:string,templateName:string)=>apiJson<PreparedMessage[]>(path('/prepare-messages'),jsonBody('POST',{memberIds,message,templateName})),
  updateHistoryStatus: (id:number,status:MessageStatus)=>apiJson<PreparedMessage>(path(`/history/${id}/status`),jsonBody('PATCH',{status})),
};
