export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export type ApprovalRequestStatus = typeof REQUEST_STATUSES[number];

export interface ApprovalRequest {
  id: string;
  title: string;
  description: string | null;
  status: ApprovalRequestStatus;
  requestType: string;
  targetEntityId: string | null;
  requestedByUserId: string | null;
  assignedToUserId: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestsResponse { items: ApprovalRequest[]; }
