import assert from 'node:assert/strict';
import test from 'node:test';
import { toLayoutRect } from './layoutViewport';

void test('convierte coordenadas físicas a píxeles de layout bajo zoom CSS', () => {
  const visual = { left: 180, top: 90, right: 270, bottom: 126, width: 90 };
  assert.deepEqual(toLayoutRect(visual, 0.9), {
    left: 200, top: 100, right: 300, bottom: 140, width: 100,
  });
  assert.deepEqual(toLayoutRect(visual, 1), visual);
});
