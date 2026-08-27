import type { CommercialPlanCode } from '@miclub/shared';
import { downloadTemplate } from '../../services/api/importApi';

const plans:readonly {code:CommercialPlanCode;name:string;summary:string}[]=[
  {code:'FREE',name:'Free',summary:'Gestión inicial sin importación de datos.'},
  {code:'SOCIAL',name:'Social',summary:'Habilita el módulo Migración para usarlo después.'},
  {code:'COMPLEX',name:'Complex',summary:'Habilita el módulo Migración para usarlo después.'},
  {code:'CLUB',name:'Club',summary:'Habilita el módulo Migración para usarlo después.'},
];
export function MigrationStep({selected,onSelect}:{selected:CommercialPlanCode;onSelect:(code:CommercialPlanCode)=>void}) {
 const migrationEnabled=selected!=='FREE';
 return <div className="migration-intro">
  <section className="migration-intro__plans" aria-labelledby="migration-plans-title">
   <div className="migration-intro__heading"><p className="eyebrow">PLAN COMERCIAL</p><h3 id="migration-plans-title">Elegí cómo continuar</h3><p>No mostramos precios porque el cobro todavía no está implementado en esta fase.</p></div>
   <div className="migration-plan-grid" role="radiogroup" aria-label="Plan comercial">
    {plans.map(plan=><label className="migration-plan-card" data-selected={selected===plan.code} key={plan.code}>
      <input type="radio" name="commercial-plan" value={plan.code} checked={selected===plan.code} onChange={()=>onSelect(plan.code)}/>
      <span className="migration-plan-card__badge">Plan {plan.name}</span><strong>{plan.code==='FREE'?'Continuar con Free':`Elegir ${plan.name}`}</strong><p>{plan.summary}</p>
    </label>)}
   </div>
   <p className="onboarding-warning" role="note">{migrationEnabled?<><strong>El plan elegido habilita Migración.</strong> Cuando finalices, podrás abrir el módulo desde el panel y cargar el XLSX.</>:<><strong>Free no puede importar.</strong> Podés terminar el onboarding y elegir un plan habilitado más adelante.</>}</p>
   {migrationEnabled&&<p role="note">La elección libre de planes pagos sólo está habilitada en pruebas. En producción requerirá la feature flag explícita y quedará pendiente de pago hasta integrar la pasarela; acá no se solicitan tarjetas.</p>}
  </section>
  <details className="migration-guide"><summary>1. Conocer el modelo XLSX</summary><div className="migration-intro__workbook"><h3>Dos hojas, una única fuente de datos</h3><div className="migration-sheet-grid"><article><strong>ADMINISTRACIÓN</strong><p>Ingresos, egresos y capital con sus referencias.</p></article><article><strong>INSCRIPCIONES</strong><p>Personas, actividades, cuotas y estados.</p></article></div><p><strong>Las referencias deben coincidir exactamente</strong> con los catálogos configurados en miClub.</p><button className="secondary-button" type="button" onClick={()=>void downloadTemplate()}>Descargar Modelo_Import_miClub.xlsx</button></div></details>
  <details className="migration-guide"><summary>2. Preparar y validar la importación</summary><section className="migration-intro__flow"><ol><li><span>1</span><div><strong>Descargar</strong><p>No modifiques hojas ni encabezados.</p></div></li><li><span>2</span><div><strong>Adaptar</strong><p>Copiá datos y referencias.</p></div></li><li><span>3</span><div><strong>Dry-run</strong><p>Revisá todos los errores.</p></div></li><li><span>4</span><div><strong>Confirmar</strong><p>Aplicá el lote validado.</p></div></li></ol></section></details>
  <aside className="migration-capital-warning" role="note"><span aria-hidden="true">!</span><div><strong>Evitá duplicar el capital inicial</strong><p>Si el XLSX contiene capital inicial, dejá en cero Caja, Cuenta Corriente y Dólares del paso 2.</p></div></aside>
 </div>;
}
