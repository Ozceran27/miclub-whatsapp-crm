import type { OnboardingDraft } from '@miclub/shared';
import type { ReactNode } from 'react';
import { formatCurrencyLabel, formatOnboardingMoney } from './currencyPresentation';

type StepListItem = { icon: string; title: string; detail: string };
export function OnboardingStepList({items}:{items:readonly StepListItem[]}) { return <ol className="onboarding-step-list" aria-label="Pasos de la configuración">{items.map(({icon,title,detail})=><li key={title}><span aria-hidden="true">{icon}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>; }
export function OnboardingRecommendation({icon='i',title,children,tone='info'}:{icon?:string;title:string;children:ReactNode;tone?:'info'|'critical'|'success'}) { return <aside className="onboarding-recommendation" data-tone={tone} role="note"><span aria-hidden="true">{icon}</span><div><h3>{title}</h3><p>{children}</p></div></aside>; }
export function OnboardingSummaryCard({label,value,detail}:{label:string;value:string;detail?:string}) { return <article className="onboarding-summary-card"><h3>{label}</h3><p className="onboarding-summary-card__value">{value}</p>{detail&&<p>{detail}</p>}</article>; }

export function OnboardingDraftSummary({draft}:{draft:OnboardingDraft}) {
 const customSectors=draft.sectors.filter(sector=>!sector.isSystem).length;
 const omitted=[customSectors===0?'Sectores':null,draft.workers.length===0?'Trabajadores':null,draft.activities.length===0?'Actividades':null].filter(Boolean).join(', ');
 return <section className="onboarding-summary" aria-labelledby="onboarding-summary-title"><h3 id="onboarding-summary-title">Resumen de tu configuración</h3><div className="onboarding-summary__grid">
  <OnboardingSummaryCard label="Moneda y saldos" value={formatCurrencyLabel(draft.openingBalances.currency)} detail={`Caja ${formatOnboardingMoney(draft.openingBalances.cash,draft.openingBalances.currency)} · Cuenta ${formatOnboardingMoney(draft.openingBalances.bank,draft.openingBalances.currency)} · Dólares ${formatOnboardingMoney(draft.openingBalances.usdCash,'USD')}`}/>
  <OnboardingSummaryCard label="Sectores" value={`${draft.sectors.length} en total`} detail={`${customSectors} personalizados · ${draft.sectors.length-customSectors} esenciales · ${draft.sectors.filter(s=>s.capacityMode==='INCOME').length} por ingresos · ${draft.sectors.filter(s=>s.capacityMode==='ENROLLMENTS').length} por espacio`}/>
  <OnboardingSummaryCard label="Trabajadores" value={String(draft.workers.length)}/><OnboardingSummaryCard label="Actividades" value={String(draft.activities.length)}/>
  <OnboardingSummaryCard label="Plan / migración" value={`Plan ${draft.selectedPlanCode}`} detail={draft.selectedPlanCode==='FREE'?'Finaliza en el panel; Migración no estará habilitada.':'Al finalizar se concederán las capacidades del plan y se verificará el acceso antes de ofrecer Migración.'}/><OnboardingSummaryCard label="Pasos omitidos" value={omitted||'Ninguno'} detail={omitted?'Podés completarlos luego desde Administración.':undefined}/>
 </div></section>;
}
