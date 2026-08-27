import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('el editor usa iconKey editable y no presenta una plantilla', async () => {
  const source = await readFile(new URL('./SectorDraftList.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Elegí una plantilla|name="templateId"/);
  assert.match(source, /name="iconKey"/);
  assert.match(source, /title=\{icon\.name\}/);
  assert.match(source, /className="sr-only">\{icon\.name\}/);
});
