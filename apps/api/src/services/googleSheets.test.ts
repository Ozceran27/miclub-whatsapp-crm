import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompleted, isExpense, isIncome, isPending, normalizeMoney, normalizeOperationalStatus, normalizeSheetText } from './googleSheets.js';

test('normalizeOperationalStatus normaliza estados operativos conocidos', () => {
  assert.equal(normalizeOperationalStatus('Al Día'), 'al_dia');
  assert.equal(normalizeOperationalStatus('Al dia'), 'al_dia');
  assert.equal(normalizeOperationalStatus('Nuevo Inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('nuevo inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('Adeudando'), 'adeudando');
  assert.equal(normalizeOperationalStatus('Abandonado'), 'abandonado');
  assert.equal(normalizeOperationalStatus(''), 'otro');
});

test('normalizeOperationalStatus tolera espacios, saltos de línea y guiones', () => {
  assert.equal(normalizeOperationalStatus('  AL\nDÍA  '), 'al_dia');
  assert.equal(normalizeOperationalStatus('Nuevo - Inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('  abandonado  '), 'abandonado');
});


test('normalizeMoney interpreta montos argentinos y de Google Sheets sin reescalar', () => {
  assert.equal(normalizeMoney('1.081.000'), 1081000);
  assert.equal(normalizeMoney('$1.081.000'), 1081000);
  assert.equal(normalizeMoney('1.081.000,50'), 1081000.5);
  assert.equal(normalizeMoney('25.000'), 25000);
  assert.equal(normalizeMoney('$25.000'), 25000);
  assert.equal(normalizeMoney('1.400.000'), 1400000);
  assert.equal(normalizeMoney('665.000'), 665000);
  assert.equal(normalizeMoney('1081000'), 1081000);
  assert.equal(normalizeMoney(1081000), 1081000);
  assert.equal(normalizeMoney('1,081,000'), 1081000);
  assert.equal(normalizeMoney('1081.50'), 1081.5);
  assert.equal(normalizeMoney(''), 0);
  assert.equal(normalizeMoney('—'), 0);
});

test('helpers financieros normalizan texto, moneda y estados de ADMINISTRACIÓN', () => {
  assert.equal(normalizeSheetText('  ADMINISTRACIÓN  '), 'ADMINISTRACION');
  assert.equal(normalizeMoney('$ 1.234.567,89'), 1234567.89);
  assert.equal(normalizeMoney('ARS 12,50'), 12.5);
  assert.equal(normalizeMoney(''), 0);
  assert.equal(isCompleted(' completado '), true);
  assert.equal(isPending('PENDIENTE'), true);
  assert.equal(isIncome('ingresos'), true);
  assert.equal(isExpense('EGRESOS'), true);
});
