type EconomyDashboardStateProps = {
  type: 'loading' | 'error' | 'empty';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  isActionDisabled?: boolean;
};

const iconByType: Record<EconomyDashboardStateProps['type'], string> = {
  loading: '⏳',
  error: '⚠️',
  empty: '📭'
};

export function EconomyDashboardState({ type, title, message, actionLabel, onAction, isActionDisabled }: EconomyDashboardStateProps) {
  return (
    <section className={`card economy-state economy-state--${type}`} role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className="economy-state__icon" aria-hidden="true">{iconByType[type]}</span>
      <div className="economy-state__content">
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {actionLabel && onAction && (
        <button className="icon-btn home-sync-button economy-state__action" onClick={onAction} disabled={isActionDisabled}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
