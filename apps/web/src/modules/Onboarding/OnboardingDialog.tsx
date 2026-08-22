import type { OnboardingDraft, OnboardingStep } from '@miclub/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { OnboardingProgress } from './OnboardingProgress';
import { getOnboardingSteps, isSkippableStep } from './steps';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export const getNextStep = (step: OnboardingStep) => Math.min(7, step + 1) as OnboardingStep;

type Props = { draft:OnboardingDraft; updateDraft:<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>void; migrationAvailable: boolean; pending: boolean; error: string; onComplete: () => void };
function ActionIcon({ type }: { type: 'next'|'skip'|'retry'|'launch' }) {
  const symbols={next:'→',skip:'↷',retry:'↻',launch:'★'};
  return <span className="onboarding-action-icon" aria-hidden="true">{symbols[type]}</span>;
}
export function OnboardingDialog({ draft,updateDraft,migrationAvailable, pending, error, onComplete }: Props) {
  const titleId = useId(); const dialogRef = useRef<HTMLDivElement>(null); const [step,setStep]=useState<OnboardingStep>(1); const content = getOnboardingSteps(migrationAvailable,draft,updateDraft)[step - 1];
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current; dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [step]);
  const advance = () => setStep(getNextStep(step));
  const status = pending ? 'Guardando toda la configuración…' : error ? 'No se pudo finalizar' : 'Borrador temporal · se guardará al finalizar';
  const nextLabel=step===1?'Empezar Configuración':'Siguiente';
  return <div className="onboarding-backdrop" data-testid="onboarding-backdrop">
    <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
      <OnboardingProgress step={step} />
      <div className="onboarding-viewport"><section className="onboarding-step" key={step} aria-busy={pending}><header className="onboarding-step__header"><span className="onboarding-step__icon" aria-hidden="true">{content.icon}</span><div><p className="onboarding-step__eyebrow">{content.eyebrow}</p><h2 id={titleId}>{content.title}</h2><p>{content.description}</p></div></header>{content.body}</section></div>
      <div className="onboarding-save-state" data-state={error?'error':pending?'loading':'ready'} role="status" aria-live="polite"><span aria-hidden="true">{error?'!':pending?'…':'○'}</span>{status}</div>
      {error && <div className="onboarding-error" role="alert"><p>{error}</p></div>}
      <footer className="onboarding-actions">
        {isSkippableStep(step) && <button className="ghost-btn" type="button" disabled={pending} onClick={advance}><ActionIcon type="skip"/>Omitir</button>}
        {step < 7 ? <button className="primary-btn" data-initial-focus type="button" disabled={pending} onClick={advance}><span>{nextLabel}</span><ActionIcon type="next"/></button> : <button className="primary-btn" data-initial-focus type="button" disabled={pending} onClick={onComplete}>{pending ? 'Preparando tu club…' : <><ActionIcon type="launch"/>INICIAR MI CLUB</>}</button>}
      </footer>
    </div>
  </div>;
}
