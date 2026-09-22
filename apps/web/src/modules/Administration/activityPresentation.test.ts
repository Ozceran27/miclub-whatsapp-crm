import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdministrationActivityDto } from '@miclub/shared';
import { formatActivityCivilDate, formatActivityDate, formatActivityProfitability, formatFrequency, formatMoney, formatPercentage } from './activityPresentation';

void test('normaliza porcentajes sin ceros sobrantes y limita la precisión visual', () => {
  assert.equal(formatPercentage(40), '40%');
  assert.equal(formatPercentage(35.5), '35,5%');
  assert.equal(formatPercentage(35.567), '35,57%');
});

void test('presenta importes monetarios enteros sin alterar el valor calculado', () => {
  assert.doesNotMatch(formatMoney(85_000, 'ARS'), /,00/);
  assert.match(formatMoney(85_000.6, 'ARS'), /85\.001/);
  assert.match(formatMoney(1_100_000, 'ARS'), /1\.100\.000/);
});

void test('distingue ausencia de movimientos, cotización incompleta y rentabilidad cero', () => {
  const base = { operatingCurrencyCode: 'ARS' } as AdministrationActivityDto;
  assert.equal(formatActivityProfitability({ ...base, annualOperatingProfitabilityStatus: 'NO_MOVEMENTS' }), 'Sin movimientos');
  assert.equal(formatActivityProfitability({ ...base, annualOperatingProfitabilityStatus: 'INCOMPLETE_EXCHANGE_RATE' }), 'Sin cotización');
  assert.match(formatActivityProfitability({ ...base, annualOperatingProfitabilityStatus: 'AVAILABLE', annualOperatingProfitability: 0 }), /0/);
});

void test('las fechas civiles no retroceden por la zona horaria del navegador', () => {
  assert.match(formatActivityDate('2026-09-22'), /22\/9\/2026/);
  assert.match(formatActivityCivilDate('2026-09-22T03:00:00.000Z'), /22\/9\/2026/);
  assert.doesNotMatch(formatActivityCivilDate('2026-09-22T03:00:00.000Z'), /\d+:\d+/);
  assert.equal(formatFrequency('MONTHLY'), 'mensual');
});
