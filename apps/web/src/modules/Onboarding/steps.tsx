import React from 'react';
import { isOptionalOnboardingStep } from '@miclub/shared';
import { ActivitySetupForm, SectorSetupForm, WorkerSetupForm } from '../Administration/SetupForms';
import { MigrationStep } from './MigrationStep';
import { OpeningBalancesStep } from './OpeningBalancesStep';

export const getOnboardingSteps = (migrationAvailable: boolean) => [
  { eyebrow:'Tu club empieza acá', icon:'🏟', title: '¡Te damos la bienvenida a miClub!', description:'En siete pasos breves vamos a dejar listo el espacio de gestión de tu institución.', body: <div className="onboarding-welcome"><p>Configurá saldos, sectores, equipo y actividades. Podés omitir las secciones opcionales y completarlas más adelante desde Administración.</p><div className="onboarding-hero" aria-hidden="true">miClub</div><p className="onboarding-tip"><span aria-hidden="true">✓</span> Cada avance queda guardado para que puedas retomar cuando quieras.</p></div> },
  { eyebrow:'Base contable', icon:'$', title: 'Definí los saldos iniciales', description:'Registrá el capital con el que comienza a operar el club en miClub.', body: <OpeningBalancesStep /> },
  { eyebrow:'Espacios del club', icon:'⌂', title: 'Organizá tus sectores', description:'Creá las áreas donde sucede la actividad diaria y definí su estado operativo.', body: <><p>Los sectores del sistema están protegidos. Podrás sumar otros desde el catálogo y editarlos más adelante.</p><SectorSetupForm /></> },
  { eyebrow:'Tu equipo', icon:'♙', title: 'Sumá a tus trabajadores', description:'Registrá a las personas que participan en la administración y operación del club.', body: <><p>Asigná datos laborales y accesos. La ficha se abre en una ventana accesible que podés cerrar con Escape.</p><WorkerSetupForm /></> },
  { eyebrow:'Propuesta deportiva', icon:'◆', title: 'Configurá las actividades', description:'Relacioná cada propuesta con un sector, un instructor y sus condiciones económicas.', body: <><p>Podés crear una actividad inicial ahora o completar el catálogo después desde Administración.</p><ActivitySetupForm /></> },
  { eyebrow:'Traé tu información', icon:'⇧', title: 'Importá tus datos históricos', description:'Validá una planilla antes de incorporar información previa a miClub.', body: <MigrationStep available={migrationAvailable} /> },
  { eyebrow:'Todo preparado', icon:'✓', title: '¡Tu club está listo!', description:'Completaste la configuración inicial y ya podés empezar a gestionar desde el panel principal.', body: <div className="onboarding-finish"><div className="onboarding-hero" aria-hidden="true">✓</div><p>Tu progreso quedó guardado. Desde Administración podrás revisar sectores, trabajadores, actividades y preferencias cuando lo necesites.</p></div> }
] as const;

export const ONBOARDING_STEPS = getOnboardingSteps(true);
export const isSkippableStep = isOptionalOnboardingStep;
