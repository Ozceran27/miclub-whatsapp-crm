import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
  description?: string;
  size?: 'medium' | 'large';
  busy?: boolean;
  onClose: () => void;
};

export function ConfigurationEditorModal({
  title,
  children,
  footer,
  eyebrow,
  description,
  size = 'medium',
  busy = false,
  onClose,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0], last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return <div className="draft-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialogRef} className={`draft-modal draft-modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
      <header>
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h3 id={titleId}>{title}</h3>{description && <p id={descriptionId}>{description}</p>}</div>
        <button className="draft-icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar modal">×</button>
      </header>
      <div className="draft-modal__body">{children}</div>
      {footer && <footer className="draft-modal__footer">{footer}</footer>}
    </div>
  </div>;
}
