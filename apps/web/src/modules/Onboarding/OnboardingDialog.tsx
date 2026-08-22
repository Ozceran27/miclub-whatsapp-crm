import { SUPPORTED_OPERATIONAL_CURRENCIES, type OnboardingDraft, type OnboardingStep, type OnboardingStepOutcome } from '@miclub/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { OnboardingProgress } from './OnboardingProgress';
import { getOnboardingSteps, isSkippableStep } from './steps';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export const getNextStep = (step: OnboardingStep) => Math.min(7, step + 1) as OnboardingStep;
export const getPreviousStep = (step: OnboardingStep) => Math.max(1, step - 1) as OnboardingStep;
export const hasValidOpeningBalances = ({currency,cash,bank,usdCash}:OnboardingDraft['openingBalances']) =>
  SUPPORTED_OPERATIONAL_CURRENCIES.includes(currency) && [cash,bank,usdCash].every(value=>Number.isFinite(value)&&value>=0);

type Props = { step:OnboardingStep; direction:'forward'|'backward'; draft:OnboardingDraft; updateDraft:<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>void; migrationAvailable: boolean; pending: boolean; error: string; onNext:(outcome?:OnboardingStepOutcome)=>void; onBack:()=>void; onComplete: () => void };
function ActionIcon({ type }: { type: 'next'|'skip'|'retry'|'launch' }) {
  const symbols={next:'→',skip:'↷',retry:'↻',launch:'★'};
  return <span className="onboarding-action-icon" aria-hidden="true">{symbols[type]}</span>;
}
export function OnboardingDialog({ step,direction,draft,updateDraft,migrationAvailable, pending, error, onNext,onBack,onComplete }: Props) {
  const titleId = useId(); const dialogRef = useRef<HTMLDivElement>(null); const headingRef=useRef<HTMLHeadingElement>(null); const [validationError,setValidationError]=useState(''); const content = getOnboardingSteps(migrationAvailable,draft,updateDraft)[step - 1];
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
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
  }, []);
  useEffect(()=>{headingRef.current?.focus();setValidationError('');},[step]);
  const advance = (outcome:OnboardingStepOutcome='COMPLETED') => {
    if(step===2&&!hasValidOpeningBalances(draft.openingBalances)){setValidationError('Revisá la moneda y los saldos: deben ser números iguales o mayores que cero.');return;}
    onNext(outcome);
  };
  const goBack=()=>onBack();
  const optional = isSkippableStep(step);
  const status = pending ? 'Guardando configuración…' : error ? 'No se pudo finalizar' : 'Borrador temporal';
  const nextLabel=step===1?'Empezar Configuración':'Siguiente';
  return <div className="onboarding-backdrop" data-testid="onboarding-backdrop">
    <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
      <div className="onboarding-dialog__top"><OnboardingProgress step={step} optional={optional} /></div>
      <div className="onboarding-viewport"><section className="onboarding-step" data-direction={direction} key={step} aria-busy={pending}><header className="onboarding-step__header"><span className="onboarding-step__icon" aria-hidden="true">{content.icon}</span><div><div className="onboarding-step__meta"><p className="onboarding-step__eyebrow">{content.eyebrow}</p><span className="onboarding-requirement">{optional ? 'Opcional' : 'Obligatorio'}</span></div><h2 id={titleId} ref={headingRef} tabIndex={-1} data-initial-focus>{content.title}</h2><p>{content.description}</p></div></header>{content.body}</section></div>
      <footer className="onboarding-actions">
        <div className="onboarding-feedback"><div className="onboarding-save-state" data-state={error?'error':pending?'loading':'ready'} role="status" aria-live="polite"><span aria-hidden="true">{error?'!':pending?'…':'○'}</span>{status}</div>{error && <div className="onboarding-error" role="alert"><p>{error}</p></div>}{validationError && <div className="onboarding-error" role="alert"><p>{validationError}</p></div>}</div>
        <div className="onboarding-actions__buttons">
        {step>=2&&<button className="secondary-btn" type="button" disabled={pending} onClick={goBack}>← Atrás</button>}
        {optional && <button className="ghost-btn" type="button" disabled={pending} title="Descartar los cambios temporales de este paso y continuar" onClick={()=>advance('SKIPPED')}><ActionIcon type="skip"/>Omitir</button>}
        {step < 7 ? <button className="primary-btn" type="button" disabled={pending} onClick={()=>advance()}><span>{nextLabel}</span><ActionIcon type="next"/></button> : <button className="primary-btn" type="button" disabled={pending} onClick={onComplete}>{pending ? 'Preparando tu club…' : <><ActionIcon type="launch"/>INICIAR MI CLUB</>}</button>}
        </div>
      </footer>
    </div>
  </div>;
}
