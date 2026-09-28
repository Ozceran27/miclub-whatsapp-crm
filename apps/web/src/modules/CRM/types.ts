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
