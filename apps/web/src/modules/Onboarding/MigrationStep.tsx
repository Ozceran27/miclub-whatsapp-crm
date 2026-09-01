import type { CommercialPlan, CommercialPlanCode } from '@miclub/shared';
import React, { useEffect, useState } from 'react';
import { getCommercialPlans } from '../../services/api/commercialPlansApi';
import { downloadTemplate } from '../../services/api/importApi';

type Props={selected:CommercialPlanCode;onSelect:(code:CommercialPlanCode)=>void};

export function CommercialPlanCards({plans,selected,onSelect}:{plans:readonly CommercialPlan[]}&Props) {
 return <div className="migration-plan-grid" role="radiogroup" aria-label="Plan comercial">
  {plans.map(plan=>{const selectedPlan=selected===plan.code;const descriptionId=`commercial-plan-${plan.code.toLowerCase()}-description`;return <label className="migration-plan-card" data-selected={selectedPlan} key={plan.code}>
   <span className="migration-plan-card__top"><input type="radio" name="commercial-plan" value={plan.code} checked={selectedPlan} aria-describedby={descriptionId} onChange={()=>onSelect(plan.code)}/>{plan.recommended&&<span className="migration-plan-card__recommended">Recomendado</span>}</span>
   <span className="migration-plan-card__badge">Plan {plan.name}</span>
   <strong className="migration-plan-card__title">{plan.description}</strong>
   <span className="migration-plan-card__audience">{plan.targetAudience}</span>
   <ul>{plan.highlightedFeatures.map(feature=><li key={feature}>{feature}</li>)}</ul>
   <span className="migration-plan-card__migration" data-available={plan.migrationAvailable}>{plan.migrationAvailable?'✓ Migración disponible':'— Migración no disponible'}</span>
   <span className="migration-plan-card__price">{plan.priceLabel}</span>
   <span className="migration-plan-card__cta" aria-hidden="true">{selectedPlan?'Plan seleccionado':plan.ctaText}</span>
   <span className="sr-only" id={descriptionId}>{plan.commercialClass==='paid'?'En sandbox, esta selección concede acceso de prueba y no representa un pago.':'Permite completar el onboarding, pero no habilita importaciones.'}</span>
  </label>})}
 </div>;
}

export function MigrationStep({selected,onSelect}:Props) {
 const [plans,setPlans]=useState<CommercialPlan[]|null>(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError(false);getCommercialPlans(controller.signal).then(setPlans).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[reload]);
 const migrationEnabled=plans?.find(plan=>plan.code===selected)?.migrationAvailable??false;
 return <div className="migration-intro">
  <section className="migration-intro__plans" aria-labelledby="migration-plans-title">
   <div className="migration-intro__heading"><p className="eyebrow">PLAN COMERCIAL</p><h3 id="migration-plans-title">Elegí cómo continuar</h3><p><strong>Sin cobro durante esta etapa.</strong> Los precios aún no están definidos y se comunicarán desde el catálogo.</p></div>
   {!plans&&!error&&<p className="migration-plan-status" role="status">Cargando planes…</p>}
   {error&&<div className="migration-plan-status migration-plan-status--error" role="alert"><p>No pudimos cargar los planes. Revisá tu conexión e intentá nuevamente.</p><button type="button" className="secondary-button" onClick={()=>setReload(value=>value+1)}>Reintentar</button></div>}
   {plans&&<CommercialPlanCards plans={plans} selected={selected} onSelect={onSelect}/>}
   {plans&&<p className="onboarding-warning" role="note">{migrationEnabled?<><strong>El plan elegido habilita Migración.</strong> En este sandbox obtenés acceso de prueba: elegirlo no representa un pago ni solicita una tarjeta.</>:<><strong>Free permite completar el onboarding, pero no habilita importaciones.</strong> Podés elegir un plan con Migración más adelante.</>}</p>}
  </section>
  <details className="migration-guide"><summary>1. Conocer el modelo XLSX</summary><div className="migration-intro__workbook"><h3>Dos hojas, una única fuente de datos</h3><div className="migration-sheet-grid"><article><strong>ADMINISTRACIÓN</strong><p>Ingresos, egresos y capital con sus referencias.</p></article><article><strong>INSCRIPCIONES</strong><p>Personas, actividades, cuotas y estados.</p></article></div><p><strong>Las referencias deben coincidir exactamente</strong> con los catálogos configurados en miClub.</p><button className="secondary-button" type="button" onClick={()=>void downloadTemplate()}>Descargar Modelo_Import_miClub.xlsx</button></div></details>
  <details className="migration-guide"><summary>2. Preparar y validar la importación</summary><section className="migration-intro__flow"><ol><li><span>1</span><div><strong>Descargar</strong><p>No modifiques hojas ni encabezados.</p></div></li><li><span>2</span><div><strong>Adaptar</strong><p>Copiá datos y referencias.</p></div></li><li><span>3</span><div><strong>Dry-run</strong><p>Revisá todos los errores.</p></div></li><li><span>4</span><div><strong>Confirmar</strong><p>Aplicá el lote validado.</p></div></li></ol></section></details>
  <aside className="migration-capital-warning" role="note"><span aria-hidden="true">!</span><div><strong>Evitá duplicar el capital inicial</strong><p>Si el XLSX contiene capital inicial, dejá en cero los tres saldos del paso 2.</p></div></aside>
 </div>;
}
