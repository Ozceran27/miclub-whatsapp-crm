import type { ApprovalRequest, ApprovalRequestsResponse } from '@miclub/shared';
import { apiJson } from '../../api';
export const getRequests = (signal?: AbortSignal) => apiJson<ApprovalRequestsResponse>('/api/requests', { cache: 'no-store', signal });
export const getRequest = (id: string, signal?: AbortSignal) => apiJson<ApprovalRequest>(`/api/requests/${id}`, { cache: 'no-store', signal });
export const approveRequest = (id: string, reason?: string) => apiJson<ApprovalRequest>(`/api/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) });
export const rejectRequest = (id: string, reason?: string) => apiJson<ApprovalRequest>(`/api/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) });
