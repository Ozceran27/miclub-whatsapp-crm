import type { OnboardingDraft } from '@miclub/shared';
import { isOptionalOnboardingStep } from '@miclub/shared';
import React from 'react';
import { ActivityDraftList } from './editors/ActivityDraftList';
import { SectorDraftList } from './editors/SectorDraftList';
import { WorkerDraftList } from './editors/WorkerDraftList';
import { MigrationStep } from './MigrationStep';
import { OpeningBalancesStep } from './OpeningBalancesStep';
import { OnboardingDraftSummary, OnboardingRecommendation, OnboardingStepList } from './OnboardingSummary';

const welcomeSteps=[{icon:'$',title:'Saldos',detail:'Definí la moneda y el capital inicial.'},{icon:'⌂',title:'Sectores',detail:'Organizá los espacios del club.'},{icon:'♙',title:'Trabajadores',detail:'Prepará las altas de tu equipo.'},{icon:'◆',title:'Actividades',detail:'Armá tu propuesta deportiva.'},{icon:'⇧',title:'Plan / migración',detail:'Revisá las alternativas para traer información.'},{icon:'✓',title:'Revisión final',detail:'Confirmá todo antes del envío definitivo.'}] as const;

export const getOnboardingSteps = (migrationAvailable:boolean,draft:OnboardingDraft,update:<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>void) => [
 {eyebrow:'Tu club empieza acá',icon:'🏟',title:'¡Te damos la bienvenida a miClub!',description:'En pocos minutos vas a preparar la base de gestión de tu institución.',body:<div className="onboarding-welcome"><OnboardingStepList items={welcomeSteps}/><OnboardingRecommendation icon="↷" title="Avanzá a tu ritmo">Los pasos opcionales se pueden omitir y completar más adelante desde Administración. Nada se envía mientras avanzás: el envío definitivo ocurre al finalizar.</OnboardingRecommendation></div>},
 {eyebrow:'Base contable',icon:'$',title:'Definí los saldos iniciales',description:'Registrá el capital con el que comienza a operar el club.',body:<OpeningBalancesStep values={draft.openingBalances} onChange={v=>update('openingBalances',v)}/>},
 {eyebrow:'Espacios del club',icon:'⌂',title:'Organizá tus sectores',description:'Prepará las áreas nuevas del club.',body:<SectorDraftList items={draft.sectors} onChange={v=>update('sectors',v)}/>},
 {eyebrow:'Tu equipo',icon:'♙',title:'Sumá a tus trabajadores',description:'Prepará las altas que se crearán al finalizar.',body:<WorkerDraftList items={draft.workers} onChange={v=>update('workers',v)}/>},
 {eyebrow:'Propuesta deportiva',icon:'◆',title:'Configurá las actividades',description:'Prepará el catálogo inicial.',body:<ActivityDraftList items={draft.activities} sectors={draft.sectors} workers={draft.workers} onChange={v=>update('activities',v)}/>},
 {eyebrow:'Traé tu información',icon:'⇧',title:'Importá tus datos históricos',description:'Conocé el modelo y prepará tus datos para importarlos después del onboarding.',body:<MigrationStep available={migrationAvailable}/>},
 {eyebrow:'Todo preparado',icon:'✓',title:'¡Tu club está listo!',description:'Revisá la configuración antes de crearla definitivamente.',body:<div className="onboarding-finish"><OnboardingDraftSummary draft={draft}/><OnboardingRecommendation icon="!" title="Una sola operación definitiva" tone="critical">“Iniciar mi club” envía toda la configuración una única vez. Mientras se procesa, el botón queda deshabilitado para prevenir un doble envío. Si termina correctamente, vas a entrar a tu club; si ocurre un error recuperable, tus datos quedan en pantalla y podés volver a intentarlo.</OnboardingRecommendation></div>},
] as const;
export const isSkippableStep=isOptionalOnboardingStep;
