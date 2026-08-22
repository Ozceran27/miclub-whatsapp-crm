import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createInitialOnboardingDraft } from './OnboardingGate';
import { getNextStep, getPreviousStep, hasValidOpeningBalances } from './OnboardingDialog';
import { getOnboardingSteps, isSkippableStep } from './steps';
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

test('cada montaje empieza en paso 1 y crea un borrador temporal nuevo', () => {
  const gate = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const firstMount = createInitialOnboardingDraft();
  firstMount.sectors.push({clientId:'temporary',templateId:'',name:'Temporal',color:'#000000',status:'active'});
  const secondMount = createInitialOnboardingDraft();
  assert.notEqual(secondMount.idempotencyKey, firstMount.idempotencyKey);
  assert.deepEqual(secondMount.sectors, []);
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

test('regresión visual: siete indicadores, acciones y estados tienen textos accesibles', () => {
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  const progress = readFileSync(new URL('./OnboardingProgress.tsx', import.meta.url), 'utf8');
  assert.match(progress, /labels = \[[\s\S]*'Listo'/);
  assert.match(progress, /aria-current=.*'step'/);
  assert.match(progress, /Progreso guardado/);
  for (const action of ['Empezar Configuración','Siguiente','Omitir','INICIAR MI CLUB']) assert.match(dialog, new RegExp(action));
  assert.match(dialog, /aria-live="polite"/);
  assert.match(dialog, /Borrador temporal · se guardará al finalizar/);
  assert.doesNotMatch(dialog, /Cambios guardados/);
});

test('regresión responsive: escritorio, móvil, tema oscuro y movimiento reducido', () => {
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(styles, /grid-template-columns: repeat\(7,1fr\)/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.onboarding-dialog/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.match(styles, /var\(--color-card\)/);
  assert.match(styles, /\.setup-manager > ul[\s\S]*repeat\(auto-fit,minmax/);
  assert.match(styles, /border: 2px dashed/);
});

test('la advertencia explica que importar capital histórico puede duplicar saldos', () => {
  const source = readFileSync(new URL('./OpeningBalancesStep.tsx', import.meta.url), 'utf8');
  assert.match(source, /Evitá duplicar tus saldos/);
  assert.match(source, /saldos quedarán duplicados/);
  assert.match(source, /role="note"/);
});

test('los modales secundarios atrapan foco, cierran con Escape y lo devuelven al invocador', () => {
  const source = readFileSync(new URL('../Administration/WorkerDetailModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /previousFocus\?\.focus\(\)/);
  assert.match(source, /aria-modal="true"/);
});

test('la migración del onboarding conserva una referencia explícita al dry-run', () => {
  const source = readFileSync(new URL('./MigrationStep.tsx', import.meta.url), 'utf8');
  assert.match(source, /onPendingImport/);
  assert.doesNotMatch(source, /Aplicar este dry-run/);
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
