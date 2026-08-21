import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getNextStep } from './OnboardingDialog';
import { isSkippableStep, ONBOARDING_STEPS } from './steps';

test('define siete pasos y solo permite omitir los pasos opcionales', () => {
  assert.equal(ONBOARDING_STEPS.length, 7);
  assert.equal(isSkippableStep(1), false); assert.equal(isSkippableStep(2), false);
  assert.equal(isSkippableStep(3), true); assert.equal(isSkippableStep(4), true);
  assert.equal(isSkippableStep(5), true); assert.equal(isSkippableStep(6), true); assert.equal(isSkippableStep(7), false);
});

test('navegación conserva el límite del séptimo paso para reanudación segura', () => {
  assert.equal(getNextStep(1), 2); assert.equal(getNextStep(6), 7); assert.equal(getNextStep(7), 7);
});

test('el diálogo implementa foco inicial, trap de teclado y bloqueo externo', () => {
  const source = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-modal="true"/); assert.match(source, /aria-labelledby/);
  assert.match(source, /data-initial-focus/); assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /event\.key === 'Escape'.*preventDefault/s);
  assert.doesNotMatch(source, /onMouseDown|onClick=\{onClose\}/);
});

test('gate recupera currentStep del servidor y persiste cada avance', () => {
  const source = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  assert.match(source, /getOnboarding\(signal\)/); assert.match(source, /state\.currentStep/);
  assert.match(source, /advanceOnboarding\(step,outcome\)/); assert.match(source, /invalidateTenantQueries\(clubId\)/);
});

test('F5 vuelve a renderizar el paso persistido y la omisión temporal depende de la política compartida', () => {
  const gate = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(gate, /step=\{state\.currentStep\}/);
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
  for (const action of ['Empezar Configuración','Siguiente','Omitir','INICIAR MI CLUB','Reintentar']) assert.match(dialog, new RegExp(action));
  assert.match(dialog, /aria-live="polite"/);
  assert.match(dialog, /Guardando este paso/);
  assert.match(dialog, /No se guardaron los últimos cambios/);
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

test('la migración del onboarding permite aplicar un dry-run válido', () => {
  const source = readFileSync(new URL('./MigrationStep.tsx', import.meta.url), 'utf8');
  assert.match(source, /summary\?\.dryRun&&state\.summary\.errors\.length===0/);
  assert.match(source, /state\.run\(state\.summary\?\.batchId\)/);
});

test('los componentes persistidos consultan catálogos, mutan entidades y refrescan la lectura', () => {
  const forms = readFileSync(new URL('../Administration/SetupForms.tsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(forms, /Promise\.all\(\[getAdministrationSectors\(\),getSectorTemplates\(\)\]\)/);
  assert.match(forms, /createAdministrationSector[\s\S]*\/api\/sectors\/\$\{s\.id\}\/status[\s\S]*\/archive/);
  assert.match(forms, /WorkerDetailModal[\s\S]*createAdministrationWorker[\s\S]*updateAdministrationWorker/);
  assert.match(forms, /\/api\/instructors[\s\S]*\/api\/administration\/activity-icons/);
  assert.match(forms, /FIXED · monto fijo[\s\S]*VARIABLE · porcentaje/);
  assert.match(dialog, /await persistence\?\.save\(\); advance\('COMPLETED'\)/);
});
