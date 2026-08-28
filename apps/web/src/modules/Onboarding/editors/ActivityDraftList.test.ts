import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = readFile(new URL('./ActivityDraftList.tsx', import.meta.url), 'utf8');

test('la selección principal de color no muestra el código hexadecimal', async () => {
  const activityEditor = await source;

  assert.match(activityEditor, /SECTOR_COLOR_PALETTE\.map/);
  assert.match(activityEditor, /className="sr-only">\{color\.name\}<\/span>/);
  assert.doesNotMatch(activityEditor, /<code>|\{value\.toUpperCase\(\)\}<\/code>/);
  assert.doesNotMatch(activityEditor, /<span className="sr-only">[^<]*\{color\.hex\}/);
  assert.match(activityEditor, />Elegir color personalizado<input/);
});

test('el color elegido continúa formando parte del borrador guardado', async () => {
  const activityEditor = await source;

  assert.match(activityEditor, /onChange=\{\(\)=>onChange\(color\.hex\)\}/);
  assert.match(activityEditor, /onChange=\{event=>onChange\(event\.target\.value\)\}/);
  assert.match(activityEditor, /const common=\{[^}]*iconKey:icon,color,status:/);
});
