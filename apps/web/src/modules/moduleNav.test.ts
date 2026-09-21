import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateSectorMenuPosition } from './ModuleNav';

void test('el submenú se posiciona sobre la interfaz sin quedar recortado por la barra', async () => {
  const below = calculateSectorMenuPosition({ left: 700, right: 810, top: 80, bottom: 120, width: 110 }, { width: 900, height: 700 });
  assert.deepEqual(below, { left: 668, top: 129, width: 220, maxHeight: 420 });

  const mobile = calculateSectorMenuPosition({ left: 250, right: 340, top: 610, bottom: 650, width: 90 }, { width: 360, height: 700 });
  assert.equal(mobile.left, 128);
  assert.ok(mobile.top < 610, 'sin espacio inferior debe abrir hacia arriba');
  assert.ok(mobile.maxHeight <= 420);

  const source = await readFile(new URL('./ModuleNav.tsx', import.meta.url), 'utf8');
  assert.match(source, /createPortal\([\s\S]+document\.body/);
});
