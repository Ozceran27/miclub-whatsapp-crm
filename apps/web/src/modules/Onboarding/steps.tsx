import React from 'react';
import { isOptionalOnboardingStep } from '@miclub/shared';
import { ActivitySetupForm, SectorSetupForm, WorkerSetupForm } from '../Administration/SetupForms';
import { MigrationStep } from './MigrationStep';
import { OpeningBalancesStep } from './OpeningBalancesStep';

export const getOnboardingSteps = (migrationAvailable: boolean) => [
  { title: 'Bienvenida', body: <><p>Vamos a preparar tu espacio de gestión. Tus avances se guardan automáticamente.</p><div className="onboarding-hero" aria-hidden="true">🏟️</div></> },
  { title: 'Saldos', body: <OpeningBalancesStep /> },
  { title: 'Sectores', body: <><p>Organizá las áreas de trabajo. También podés hacerlo luego desde Administración.</p><SectorSetupForm /></> },
  { title: 'Trabajadores', body: <><p>Registrá al equipo que participa en la operación del club.</p><WorkerSetupForm /></> },
  { title: 'Actividades', body: <><p>Relacioná propuestas, cuotas y sectores.</p><ActivitySetupForm /></> },
  { title: 'Migración', body: <MigrationStep available={migrationAvailable} /> },
  { title: 'Finalización', body: <><p>La configuración está resuelta. Ingresá al panel principal para comenzar a gestionar tu club.</p><div className="onboarding-hero" aria-hidden="true">✨</div></> }
] as const;

export const ONBOARDING_STEPS = getOnboardingSteps(true);
export const isSkippableStep = isOptionalOnboardingStep;
