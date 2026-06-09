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
