import type { OnboardingStep } from '@miclub/shared';

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const labels = ['Bienvenida', 'Saldos', 'Sectores', 'Trabajadores', 'Actividades', 'Migración', 'Listo'];
  return <nav className="onboarding-progress" aria-label={`Progreso de configuración: paso ${step} de 7`}>
    <div className="onboarding-progress__summary"><span>Paso {step} de 7</span><span className="onboarding-progress__saved" role="status"><span aria-hidden="true">✓</span> Progreso guardado</span></div>
    <ol>{labels.map((label,index) => { const number=index+1; const state=number<step?'complete':number===step?'current':'pending'; return <li key={label} data-state={state} aria-current={number===step?'step':undefined}><span aria-hidden="true">{number<step?'✓':number}</span><small>{label}</small></li>; })}</ol>
  </nav>;
}
