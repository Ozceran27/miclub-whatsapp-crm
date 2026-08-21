import type { OnboardingStep } from '@miclub/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { OnboardingProgress } from './OnboardingProgress';
import { getOnboardingSteps, isSkippableStep } from './steps';
import { StepPersistenceProvider, type StepPersistence } from './StepPersistence';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export const getNextStep = (step: OnboardingStep) => Math.min(7, step + 1) as OnboardingStep;

type Props = { step: OnboardingStep; migrationAvailable: boolean; pending: boolean; error: string; onAdvance: (step: OnboardingStep, outcome: 'COMPLETED'|'SKIPPED') => void; onComplete: () => void };
function ActionIcon({ type }: { type: 'next'|'skip'|'retry'|'launch' }) {
  const symbols={next:'→',skip:'↷',retry:'↻',launch:'★'};
  return <span className="onboarding-action-icon" aria-hidden="true">{symbols[type]}</span>;
}
export function OnboardingDialog({ step, migrationAvailable, pending, error, onAdvance, onComplete }: Props) {
  const titleId = useId(); const dialogRef = useRef<HTMLDivElement>(null); const [persistence,setPersistence]=useState<StepPersistence|null>(null); const [saveError,setSaveError]=useState(''); const [saving,setSaving]=useState(false); const content = getOnboardingSteps(migrationAvailable)[step - 1];
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
  const advance = (outcome:'COMPLETED'|'SKIPPED') => onAdvance(getNextStep(step),outcome);
  const saveAndAdvance = async () => { setSaving(true); setSaveError(''); try { await persistence?.save(); advance('COMPLETED'); } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.'); } finally { setSaving(false); } };
  const status = pending||saving ? 'Guardando este paso…' : saveError||error ? 'No se guardaron los últimos cambios' : persistence?.saved ? 'Cambios guardados' : 'Listo para continuar';
  const nextLabel=step===1?'Empezar Configuración':'Siguiente';
  return <div className="onboarding-backdrop" data-testid="onboarding-backdrop">
    <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
      <OnboardingProgress step={step} />
      <div className="onboarding-viewport"><section className="onboarding-step" key={step} aria-busy={pending||saving}><header className="onboarding-step__header"><span className="onboarding-step__icon" aria-hidden="true">{content.icon}</span><div><p className="onboarding-step__eyebrow">{content.eyebrow}</p><h2 id={titleId}>{content.title}</h2><p>{content.description}</p></div></header><StepPersistenceProvider register={setPersistence}>{content.body}</StepPersistenceProvider></section></div>
      <div className="onboarding-save-state" data-state={error||saveError?'error':pending||saving?'loading':'ready'} role="status" aria-live="polite"><span aria-hidden="true">{error||saveError?'!':pending||saving?'…':'✓'}</span>{status}</div>
      {(error||saveError) && <div className="onboarding-error" role="alert"><p>{error||saveError}</p><button type="button" disabled={pending||saving} onClick={()=>void saveAndAdvance()}><ActionIcon type="retry"/>Reintentar</button></div>}
      <footer className="onboarding-actions">
        {isSkippableStep(step) && <button className="ghost-btn" type="button" disabled={pending||saving} onClick={()=>advance('SKIPPED')}><ActionIcon type="skip"/>Omitir</button>}
        {step < 7 ? <button className="primary-btn" data-initial-focus type="button" disabled={pending||saving||persistence?.canContinue===false||persistence?.saved===false} onClick={()=>void saveAndAdvance()}>{pending||saving ? 'Guardando…' : <><span>{nextLabel}</span><ActionIcon type="next"/></>}</button> : <button className="primary-btn" data-initial-focus type="button" disabled={pending} onClick={onComplete}>{pending ? 'Preparando tu club…' : <><ActionIcon type="launch"/>INICIAR MI CLUB</>}</button>}
      </footer>
    </div>
  </div>;
}
