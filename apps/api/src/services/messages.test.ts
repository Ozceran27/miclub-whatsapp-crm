import test from 'node:test';
import assert from 'node:assert/strict';
import type { Member } from '@miclub/shared';
import { interpolateTemplate, normalizeArPhone } from './messages.js';

const baseMember: Member = {
  id: '1',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '3764123456',
  estado: 'Adeudando',
  sourceSheet: 'FITNESS',
  actividad: 'Spinning'
};

test('normalizeArPhone soporta formatos argentinos comunes', () => {
  assert.equal(normalizeArPhone('3764123456'), '5493764123456');
  assert.equal(normalizeArPhone('03764123456'), '5493764123456');
  assert.equal(normalizeArPhone('376154123456'), '5493764123456');
  assert.equal(normalizeArPhone('5493764123456'), '5493764123456');
  assert.equal(normalizeArPhone('+54 9 376 412-3456'), '5493764123456');
});

test('interpolateTemplate reemplaza placeholders esperados', () => {
  const text = interpolateTemplate('Hola {nombre} {apellido}, actividad: {actividad}.', baseMember);
  assert.equal(text, 'Hola Ana Pérez, actividad: Spinning.');
});
