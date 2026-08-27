import { useEffect, useId, useRef, type ReactNode } from 'react';

export function DraftEditorModal({ title, children, footer, size = 'medium', onClose }: { title: string; children: ReactNode; footer?: ReactNode; size?: 'medium' | 'large'; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="draft-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className={`draft-modal draft-modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h3 id={titleId}>{title}</h3><button className="draft-icon-button" type="button" onClick={onClose} aria-label="Cerrar modal">×</button></header>
      <div className="draft-modal__body">{children}</div>
      {footer && <footer className="draft-modal__footer">{footer}</footer>}
    </div>
  </div>;
}
