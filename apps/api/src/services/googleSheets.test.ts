import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOperationalStatus } from './googleSheets.js';

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
