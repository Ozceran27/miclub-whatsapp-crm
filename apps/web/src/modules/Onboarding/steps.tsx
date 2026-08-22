import type { OnboardingDraft } from '@miclub/shared';
import { isOptionalOnboardingStep } from '@miclub/shared';
import React from 'react';
import { LocalActivitySetupForm, LocalSectorSetupForm, LocalWorkerSetupForm } from '../Administration/SetupForms';
import { MigrationStep } from './MigrationStep';
import { OpeningBalancesStep } from './OpeningBalancesStep';

export const getOnboardingSteps = (migrationAvailable:boolean,draft:OnboardingDraft,update:<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>void) => [
 {eyebrow:'Tu club empieza acá',icon:'🏟',title:'¡Te damos la bienvenida a miClub!',description:'En siete pasos breves vamos a dejar listo el espacio de gestión de tu institución.',body:<div className="onboarding-welcome"><p>La configuración se mantiene temporalmente en este navegador hasta finalizar.</p></div>},
 {eyebrow:'Base contable',icon:'$',title:'Definí los saldos iniciales',description:'Registrá el capital con el que comienza a operar el club.',body:<OpeningBalancesStep values={draft.openingBalances} onChange={v=>update('openingBalances',v)}/>},
 {eyebrow:'Espacios del club',icon:'⌂',title:'Organizá tus sectores',description:'Prepará las áreas nuevas del club.',body:<LocalSectorSetupForm items={draft.sectors} onChange={v=>update('sectors',v)}/>},
 {eyebrow:'Tu equipo',icon:'♙',title:'Sumá a tus trabajadores',description:'Prepará las altas que se crearán al finalizar.',body:<LocalWorkerSetupForm items={draft.workers} onChange={v=>update('workers',v)}/>},
 {eyebrow:'Propuesta deportiva',icon:'◆',title:'Configurá las actividades',description:'Prepará el catálogo inicial.',body:<LocalActivitySetupForm items={draft.activities} sectors={draft.sectors} onChange={v=>update('activities',v)}/>},
 {eyebrow:'Traé tu información',icon:'⇧',title:'Importá tus datos históricos',description:'Podés dejar una importación validada pendiente.',body:<MigrationStep available={migrationAvailable} onPendingImport={batchId=>update('pendingImport',batchId?{batchId}:null)}/>},
 {eyebrow:'Todo preparado',icon:'✓',title:'¡Tu club está listo!',description:'Al iniciar se guardará toda la configuración en una única operación.',body:<div className="onboarding-finish"><p>Revisá los datos y presioná INICIAR MI CLUB.</p></div>},
] as const;
export const isSkippableStep=isOptionalOnboardingStep;
