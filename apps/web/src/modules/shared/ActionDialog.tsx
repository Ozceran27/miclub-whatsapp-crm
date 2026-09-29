import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

type DialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  inputLabel?: string;
};

const focusable = 'button:not([disabled]),input:not([disabled])';

function ActionDialog({ options, finish }: { options: DialogOptions; finish: (value: string | null) => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const priorFocus = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (inputRef.current ?? confirmRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); finish(null); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>(focusable)];
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); document.body.style.overflow = priorOverflow; priorFocus?.focus(); };
  }, [finish]);

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); finish(options.inputLabel ? value : 'confirmed'); };
  return <div className="ui-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) finish(null); }}>
    <div ref={dialogRef} className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={options.description ? descriptionId : undefined}>
      <header><p className="eyebrow">Confirmación</p><h2 id={titleId}>{options.title}</h2></header>
      <form className="ui-dialog__form" onSubmit={submit}>
        <div className="ui-dialog__body">
          {options.description && <p id={descriptionId} className="ui-dialog__message">{options.description}</p>}
          {options.inputLabel && <label className="ui-dialog__field">{options.inputLabel}<input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} maxLength={500} /></label>}
        </div>
        <footer><button type="button" className="ghost-btn" onClick={() => finish(null)}>Cancelar</button><button ref={confirmRef} type="submit" className="primary-btn">{options.confirmLabel ?? 'Confirmar'}</button></footer>
      </form>
    </div>
  </div>;
}

function openDialog(options: DialogOptions): Promise<string | null> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let completed = false;
    const finish = (value: string | null) => {
      if (completed) return;
      completed = true;
      queueMicrotask(() => { root.unmount(); host.remove(); resolve(value); });
    };
    root.render(<ActionDialog options={options} finish={finish} />);
  });
}

export async function confirmAction(options: DialogOptions): Promise<boolean> {
  return (await openDialog(options)) !== null;
}

export function requestText(options: DialogOptions & { inputLabel: string }): Promise<string | null> {
  return openDialog(options);
}
