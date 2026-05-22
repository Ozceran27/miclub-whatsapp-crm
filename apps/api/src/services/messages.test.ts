import test from 'node:test';
import assert from 'node:assert/strict';
import type { Member } from '@miclub/shared';
import { buildWaLink, interpolateTemplate, normalizeArPhone } from './messages.js';

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

test('buildWaLink conserva emojis y unicode en query param text', () => {
  const message = 'Hola 👋 ✅ 📌 💬';
  const link = buildWaLink('5493764123456', message);
  const parsed = new URL(link);

  assert.equal(parsed.origin, 'https://web.whatsapp.com');
  assert.equal(parsed.pathname, '/send');
  assert.equal(parsed.searchParams.get('phone'), '5493764123456');
  assert.equal(parsed.searchParams.get('app_absent'), '0');
  assert.equal(parsed.searchParams.get('text'), message);
});
