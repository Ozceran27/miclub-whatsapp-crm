import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AdministrationActivityDto } from '@miclub/shared';
import { describeActivityTerms } from './activityTerms';

const activity = { settlementMode: 'fixed', settlementFixedAmount: 1200, currencyCode: 'USD', fixedFeeFrequency: 'WEEKLY' } as AdministrationActivityDto;

void test('muestra moneda y frecuencia reales de los términos fijos', () => {
  const description = describeActivityTerms(activity);
  assert.match(description, /US\$|USD/);
  assert.match(description, /semanal/);
  assert.doesNotMatch(description, /mensual/);
});

void test('al editar conserva moneda y frecuencia cargadas', () => {
  const source = readFileSync(new URL('./ActivityCreateEditModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /useState<'ARS'\|'USD'\|'BRL'\|'EUR'>\(\(activity\?\.currencyCode/);
  assert.match(source, /name="currencyCode" value=\{currency\}/);
  assert.match(source, /name="fixedFeeFrequency" defaultValue=\{activity\?\.fixedFeeFrequency \?\? 'MONTHLY'\}/);
});
