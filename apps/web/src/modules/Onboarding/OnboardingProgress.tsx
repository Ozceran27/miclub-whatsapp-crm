import type { OnboardingStep } from '@miclub/shared';

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  return <div className="onboarding-progress" aria-label={`Paso ${step} de 7`}><span>Paso {step} de 7</span><progress value={step} max={7}>{step} de 7</progress></div>;
}
