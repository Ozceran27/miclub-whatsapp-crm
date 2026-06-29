export const ACTIONABLE_STATUSES = ['prepared', 'opened'];
export const STATUS_META = {
    prepared: { label: 'Pendiente', icon: '🕒', className: 'status-chip--prepared' },
    opened: { label: 'Abierto', icon: '👁', className: 'status-chip--opened' },
    sent_manual: { label: 'Enviado manualmente', icon: '✓', className: 'status-chip--sent' },
    skipped: { label: 'Omitido', icon: '✕', className: 'status-chip--skipped' }
};
export const getStatusLabel = (status) => STATUS_META[status ?? 'prepared'].label;
export const getStatusIcon = (status) => STATUS_META[status ?? 'prepared'].icon;
export const getStatusClass = (status) => STATUS_META[status ?? 'prepared'].className;
