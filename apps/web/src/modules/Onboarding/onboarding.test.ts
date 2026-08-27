import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createInitialOnboardingDraft } from './OnboardingGate';
import { getNextStep, getPreviousStep, hasValidOpeningBalances } from './OnboardingDialog';
import { getOnboardingSteps, isSkippableStep } from './steps';
import { OpeningBalancesStep } from './OpeningBalancesStep';
import { CURRENCY_PRESENTATIONS, formatCurrencyLabel, getCurrencyAfterKey, getCurrencyPrefix } from './currencyPresentation';
const draft={idempotencyKey:'test-key',openingBalances:{currency:'ARS' as const,cash:0,bank:0,usdCash:0},sectors:[],workers:[],activities:[],pendingImport:null};
const ONBOARDING_STEPS=getOnboardingSteps(true,draft,()=>undefined);

test('define siete pasos y solo permite omitir los pasos opcionales', () => {
  assert.equal(ONBOARDING_STEPS.length, 7);
  assert.equal(isSkippableStep(1), false); assert.equal(isSkippableStep(2), false);
  assert.equal(isSkippableStep(3), true); assert.equal(isSkippableStep(4), true);
  assert.equal(isSkippableStep(5), true); assert.equal(isSkippableStep(6), true); assert.equal(isSkippableStep(7), false);
});

test('navegación conserva el límite del séptimo paso para reanudación segura', () => {
  assert.equal(getNextStep(1), 2); assert.equal(getNextStep(6), 7); assert.equal(getNextStep(7), 7);
  assert.equal(getPreviousStep(1), 1); assert.equal(getPreviousStep(2), 1); assert.equal(getPreviousStep(7), 6);
});

test('valida saldos localmente antes de abandonar el paso obligatorio', () => {
  assert.equal(hasValidOpeningBalances(draft.openingBalances), true);
  assert.equal(hasValidOpeningBalances({...draft.openingBalances,cash:-1}), false);
  assert.equal(hasValidOpeningBalances({...draft.openingBalances,bank:Number.NaN}), false);
});

test('el diálogo implementa foco inicial, trap de teclado y bloqueo externo', () => {
  const source = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-modal="true"/); assert.match(source, /aria-labelledby/);
  assert.match(source, /data-initial-focus/); assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /event\.key === 'Escape'.*preventDefault/s);
  assert.doesNotMatch(source, /onMouseDown|onClick=\{onClose\}/);
});

test('gate recupera el estado y sólo persiste el borrador al finalizar', () => {
  const source = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  assert.match(source, /getOnboarding\(signal\)/); assert.match(source, /completeOnboarding\(draft\)/);
  assert.doesNotMatch(source, /advanceOnboarding/); assert.match(source, /invalidateTenantQueries\(clubId\)/);
});

test('al completar oculta el modal antes de refrescar el dashboard y reemplazar la ruta', () => {
  const source = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const hide = source.indexOf("setState({...result.state,status:'COMPLETED',shouldShow:false})");
  const invalidate = source.indexOf('invalidateTenantQueries(clubId)');
  const refresh = source.indexOf('await loadHomeDashboardResources()');
  const navigate = source.indexOf("navigate('/app', { replace: true })");
  assert.ok(hide >= 0 && hide < invalidate);
  assert.ok(invalidate < refresh && refresh < navigate);
});

test('cada montaje empieza en paso 1 y crea un borrador temporal nuevo', () => {
  const gate = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const firstMount = createInitialOnboardingDraft();
  firstMount.sectors.push({clientId:'temporary',templateId:'',code:'temporal',name:'Temporal',color:'#000000',status:'active',isSystem:false});
  const secondMount = createInitialOnboardingDraft();
  assert.notEqual(secondMount.idempotencyKey, firstMount.idempotencyKey);
  assert.deepEqual(secondMount.sectors.map(({code,isSystem})=>({code,isSystem})), [
    {code:'administracion',isSystem:true},{code:'tesoreria',isSystem:true},{code:'areas-comunes',isSystem:true},
  ]);
  assert.deepEqual(secondMount.workers, []);
  assert.deepEqual(secondMount.activities, []);
  assert.equal(secondMount.pendingImport, null);
  assert.match(gate, /useState<OnboardingStep>\(1\)/);
  assert.doesNotMatch(gate, /setVisibleStep\(state\.currentStep|useState<OnboardingStep>\(state/);
});

test('el borrador permanece local y la omisión temporal depende de la política compartida', () => {
  const gate = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(gate, /useState<OnboardingDraft>/);
  assert.match(dialog, /isSkippableStep\(step\).*Omitir/s);
  assert.equal(isSkippableStep(2), false);
  assert.equal(isSkippableStep(5), true);
  assert.equal(isSkippableStep(6), true);
});

test('los pasos representan exactamente el flujo solicitado y saldos usa la operación canónica', () => {
  const source = readFileSync(new URL('./steps.tsx', import.meta.url), 'utf8');
  assert.deepEqual(ONBOARDING_STEPS.map(step=>step.title),['¡Te damos la bienvenida a miClub!','Definí los saldos iniciales','Organizá tus sectores','Sumá a tus trabajadores','Configurá las actividades','Importá tus datos históricos','¡Tu club está listo!']);
  assert.match(source, /OpeningBalancesStep/); assert.match(source,/MigrationStep/);
});

test('la bienvenida anticipa el recorrido y explica opcionalidad y envío definitivo', () => {
  const source=readFileSync(new URL('./steps.tsx',import.meta.url),'utf8');
  for(const label of ['Saldos','Sectores','Trabajadores','Actividades','Plan / migración','Revisión final']) assert.match(source,new RegExp(label));
  assert.match(source,/completar más adelante desde Administración/); assert.match(source,/el envío definitivo ocurre al finalizar/);
  assert.doesNotMatch(source,/configuración es temporal|asistente se reiniciará/);
});

test('el cierre calcula el resumen desde OnboardingDraft con componentes semánticos', () => {
  const summary=readFileSync(new URL('./OnboardingSummary.tsx',import.meta.url),'utf8');
  for(const component of ['OnboardingDraftSummary','OnboardingSummaryCard','OnboardingStepList','OnboardingRecommendation']) assert.match(summary,new RegExp(component));
  for(const field of ['openingBalances','sectors','workers','activities','pendingImport']) assert.match(summary,new RegExp(`draft\\.${field}`));
  for(const label of ['Moneda y saldos','Sectores','Trabajadores','Actividades','Plan / migración','Pasos omitidos']) assert.match(summary,new RegExp(label));
});

test('los labels de estado y avance no dependen de texto en negrita', () => {
  const styles=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
  assert.match(styles,/\.onboarding-save-state \{[^}]*font-weight: 400/); assert.match(styles,/\.onboarding-actions button,[^}]*font-weight: 400/);
  assert.match(styles,/\.onboarding-save-state\[data-state='error'\] \{ font-weight: 700/);
});

test('regresión visual: siete indicadores, acciones y estados tienen textos accesibles', () => {
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  const progress = readFileSync(new URL('./OnboardingProgress.tsx', import.meta.url), 'utf8');
  assert.match(progress, /labels = \[[\s\S]*'Listo'/);
  assert.match(progress, /aria-current=.*'step'/);
  assert.match(progress, /optional \? 'Opcional' : 'Obligatorio'/);
  for (const action of ['Empezar Configuración','Siguiente','Omitir','INICIAR MI CLUB']) assert.match(dialog, new RegExp(action));
  assert.match(dialog, /aria-live="polite"/);
  assert.match(dialog, /todavía no se envió/);
  assert.match(dialog, /Enviando configuración definitiva…/);
  assert.match(dialog, /Error recuperable/);
  assert.match(dialog, /error\?'retry':'launch'/);
  assert.doesNotMatch(dialog, /Cambios guardados/);
});

test('regresión responsive: escritorio, móvil, tema oscuro y movimiento reducido', () => {
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(styles, /grid-template-columns: repeat\(7,1fr\)/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.onboarding-dialog/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.match(styles, /var\(--color-card\)/);
  assert.match(styles, /backdrop-filter: blur/);
  assert.match(styles, /@media \(max-height: 800px\)/);
  assert.match(styles, /@media \(max-height: 700px\)/);
  assert.match(styles, /grid-template-rows: auto minmax\(0,1fr\) auto/);
  assert.match(styles, /\.onboarding-viewport \{[^}]*overflow-y: auto/);
  assert.match(styles, /\.onboarding-actions button,[^}]*min-height: 44px/);
  assert.match(styles, /--onboarding-edge:[^;]+;[^}]*--onboarding-inline:/);
  assert.match(styles, /max-height: min\(760px,calc\(100dvh/);
  assert.doesNotMatch(styles, /\.onboarding-(?:dialog|backdrop|viewport|actions)[^{]*\{[^}]*(?:zoom\s*:|transform\s*:\s*scale\()/);
  assert.match(styles, /\.setup-manager > ul[\s\S]*repeat\(auto-fit,minmax/);
  assert.match(styles, /border: 2px dashed/);
});

test('la advertencia exige ceros al importar capital histórico', () => {
  const source = readFileSync(new URL('./OpeningBalancesStep.tsx', import.meta.url), 'utf8');
  assert.match(source, /Evitá duplicar tus saldos/);
  assert.match(source, /tres saldos son obligatorios y pueden ser cero/);
  assert.match(source, /ingresá cero en Caja, Cuenta Corriente y Dólares/);
  assert.doesNotMatch(source, /omití este paso/);
  assert.match(source, /role="note"/);
});

test('el catálogo de presentación cubre la lista canónica y ofrece fallback seguro', () => {
  assert.deepEqual(CURRENCY_PRESENTATIONS.map(currency=>currency.code), ['ARS','USD','BRL','EUR']);
  assert.equal(formatCurrencyLabel('ARS'), '🇦🇷 Peso argentino (ARS)');
  assert.equal(formatCurrencyLabel('ZZZ'), 'Moneda desconocida (ZZZ)');
  assert.equal(getCurrencyPrefix('ZZZ'), 'ZZZ');
});

test('el listbox renderiza bandera, semántica accesible y conserva el valor del borrador', () => {
  const values={currency:'BRL' as const,cash:12,bank:34,usdCash:56};
  const markup=renderToStaticMarkup(createElement(OpeningBalancesStep,{values,onChange:()=>undefined}));
  assert.match(markup, /🇧🇷 Real brasileño \(BRL\)/);
  assert.match(markup, /aria-haspopup="listbox"/); assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /type="hidden" name="currency" value="BRL"/);
  assert.match(markup, /Efectivo \(R\$\)/);
});

test('la navegación de teclado recorre monedas y el handler envía la selección al borrador', () => {
  assert.equal(getCurrencyAfterKey('ARS','ArrowDown'),'USD');
  assert.equal(getCurrencyAfterKey('ARS','ArrowUp'),'EUR');
  assert.equal(getCurrencyAfterKey('USD','End'),'EUR');
  const source=readFileSync(new URL('./OpeningBalancesStep.tsx',import.meta.url),'utf8');
  assert.match(source,/event\.key==='Enter'/); assert.match(source,/event\.key==='Escape'/);
  assert.match(source,/select=\(code:OperationalCurrency\)=>\{change\('currency',code\)/);
  assert.match(source,/aria-activedescendant/); assert.match(source,/role="option"/);
});

test('los modales secundarios atrapan foco, cierran con Escape y lo devuelven al invocador', () => {
  const source = readFileSync(new URL('../Administration/WorkerDetailModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /previousFocus\?\.focus\(\)/);
  assert.match(source, /aria-modal="true"/);
});

test('la migración del onboarding es informativa y deriva la carga al módulo normal', () => {
  const source = readFileSync(new URL('./MigrationStep.tsx', import.meta.url), 'utf8');
  for (const text of ['Plan Complex','Plan Club','ADMINISTRACIÓN','INSCRIPCIONES','Descargar','Adaptar','Dry-run','Confirmar','actividades, sectores y responsables','cero los tres saldos del paso 2']) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /type="file"|state\.run|onPendingImport|Aplicar este dry-run/);
});

test('Administración conserva wrappers persistentes y onboarding usa editores locales', () => {
  const forms = readFileSync(new URL('../Administration/SetupForms.tsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(forms, /Promise\.all\(\[getAdministrationSectors\(\),getSectorTemplates\(\)\]\)/);
  assert.match(forms, /createAdministrationSector[\s\S]*\/api\/sectors\/\$\{s\.id\}\/status[\s\S]*\/archive/);
  assert.match(forms, /WorkerDetailModal[\s\S]*createAdministrationWorker[\s\S]*updateAdministrationWorker/);
  assert.match(forms, /\/api\/instructors[\s\S]*\/api\/administration\/activity-icons/);
  assert.match(forms, /FIXED · monto fijo[\s\S]*VARIABLE · porcentaje/);
  assert.match(forms, /LocalSectorSetupForm/); assert.match(forms, /LocalWorkerSetupForm/); assert.match(forms, /LocalActivitySetupForm/);
  assert.doesNotMatch(dialog, /persistence\?\.save/);
});
