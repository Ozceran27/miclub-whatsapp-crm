import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getNextStep } from './OnboardingDialog';
import { isSkippableStep, ONBOARDING_STEPS } from './steps';

test('define siete pasos y solo permite omitir los pasos opcionales', () => {
  assert.equal(ONBOARDING_STEPS.length, 7);
  assert.equal(isSkippableStep(1), false); assert.equal(isSkippableStep(2), true);
  assert.equal(isSkippableStep(3), false); assert.equal(isSkippableStep(4), false);
  assert.equal(isSkippableStep(5), false); assert.equal(isSkippableStep(6), true); assert.equal(isSkippableStep(7), false);
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

test('F5 vuelve a renderizar el paso persistido y Omitir depende de la política compartida', () => {
  const gate = readFileSync(new URL('./OnboardingGate.tsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('./OnboardingDialog.tsx', import.meta.url), 'utf8');
  assert.match(gate, /step=\{state\.currentStep\}/);
  assert.match(dialog, /isSkippableStep\(step\).*Omitir/s);
  assert.equal(isSkippableStep(5), false);
  assert.equal(isSkippableStep(6), true);
});

test('los pasos representan exactamente el flujo solicitado y saldos usa la operación canónica', () => {
  const source = readFileSync(new URL('./steps.tsx', import.meta.url), 'utf8');
  assert.deepEqual(ONBOARDING_STEPS.map(step=>step.title),['Bienvenida','Saldos','Sectores','Trabajadores','Actividades','Migración','Finalización']);
  assert.match(source, /OpeningBalancesStep/); assert.match(source,/MigrationStep/);
});

test('la migración del onboarding permite aplicar un dry-run válido', () => {
  const source = readFileSync(new URL('./MigrationStep.tsx', import.meta.url), 'utf8');
  assert.match(source, /summary\?\.dryRun&&state\.summary\.errors\.length===0/);
  assert.match(source, /state\.run\(state\.summary\?\.batchId\)/);
});
