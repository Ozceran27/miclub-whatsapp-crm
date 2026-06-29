export type ApiError = { error: true; message: string };

export type SyncStatus = {
  source: 'mock' | 'google_sheets';
  enabled: boolean;
  sheets: string[];
  lastSyncAt?: string;
  error?: string;
};

export type Summary = {
  totalMembers: number;
  totalDebtors: number;
  totalEstimatedDebt: number;
  debtorsWithoutPayments?: number;
};

export type ViewMode = 'debtors' | 'members';
export type SortDirection = 'asc' | 'desc';
export type SortBy = 'nombre' | 'apellido' | 'actividad' | 'sourceSheet' | 'estado' | 'cuota' | 'lastPaymentAt' | 'lastContactAt' | 'contactedRecently';
export type MessageStatus = 'prepared' | 'opened' | 'sent_manual' | 'skipped';

export const ACTIONABLE_STATUSES: MessageStatus[] = ['prepared', 'opened'];

export const STATUS_META: Record<MessageStatus, { label: string; icon: string; className: string }> = {
  prepared: { label: 'Pendiente', icon: '🕒', className: 'status-chip--prepared' },
  opened: { label: 'Abierto', icon: '👁', className: 'status-chip--opened' },
  sent_manual: { label: 'Enviado manualmente', icon: '✓', className: 'status-chip--sent' },
  skipped: { label: 'Omitido', icon: '✕', className: 'status-chip--skipped' }
};

export const getStatusLabel = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].label;
export const getStatusIcon = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].icon;
export const getStatusClass = (status?: MessageStatus) => STATUS_META[status ?? 'prepared'].className;
