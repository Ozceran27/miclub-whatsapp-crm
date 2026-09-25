import assert from 'node:assert/strict';
import test from 'node:test';
import { toLayoutRect } from './layoutViewport';

void test('convierte coordenadas físicas a píxeles de layout bajo zoom CSS', () => {
  const visual = { left: 170, top: 85, right: 255, bottom: 119, width: 85 };
  assert.deepEqual(toLayoutRect(visual, 0.85), {
    left: 200, top: 100, right: 300, bottom: 140, width: 100,
  });
  assert.deepEqual(toLayoutRect(visual, 1), visual);
});
