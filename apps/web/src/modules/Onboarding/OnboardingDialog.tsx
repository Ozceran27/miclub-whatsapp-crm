import type { OnboardingStep } from '@miclub/shared';
import { useEffect, useId, useRef } from 'react';
import { OnboardingProgress } from './OnboardingProgress';
import { isSkippableStep, ONBOARDING_STEPS } from './steps';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export const getNextStep = (step: OnboardingStep) => Math.min(7, step + 1) as OnboardingStep;

type Props = { step: OnboardingStep; pending: boolean; error: string; onAdvance: (step: OnboardingStep) => void; onComplete: () => void };
export function OnboardingDialog({ step, pending, error, onAdvance, onComplete }: Props) {
  const titleId = useId(); const dialogRef = useRef<HTMLDivElement>(null); const content = ONBOARDING_STEPS[step - 1];
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
  const advance = () => onAdvance(getNextStep(step));
  return <div className="onboarding-backdrop" data-testid="onboarding-backdrop">
    <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
      <OnboardingProgress step={step} />
      <div className="onboarding-viewport"><section className="onboarding-step" key={step}><h2 id={titleId}>{content.title}</h2>{content.body}</section></div>
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      <footer className="onboarding-actions">
        {isSkippableStep(step) && <button className="ghost-btn" type="button" disabled={pending} onClick={advance}>Omitir</button>}
        {step < 7 ? <button className="primary-btn" data-initial-focus type="button" disabled={pending} onClick={advance}>{pending ? 'Guardando…' : 'Continuar'}</button> : <button className="primary-btn" data-initial-focus type="button" disabled={pending} onClick={onComplete}>{pending ? 'Preparando tu club…' : 'INICIAR MI CLUB'}</button>}
      </footer>
    </div>
  </div>;
}
