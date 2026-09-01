import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';

export function UiCard({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`ui-card ${className}`.trim()}>{children}</section>;
}
export function UiAlert({ tone = 'info', children }: PropsWithChildren<{ tone?: 'info'|'success'|'warning'|'error' }>) {
  return <div className="ui-alert" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function UiState({ title, children, action }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return <div className="ui-state"><h3>{title}</h3><div>{children}</div>{action}</div>;
}
export const UiButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary' }>(function UiButton({ variant = 'primary', className = '', ...props }, ref) {
  return <button ref={ref} type="button" className={`ui-button ui-button--${variant} ${className}`.trim()} {...props} />;
});
export function UiTable({ label, children }: PropsWithChildren<{ label: string }>) {
  return <div className="ui-table-scroll" tabIndex={0} role="region" aria-label={label}><table>{children}</table></div>;
}
