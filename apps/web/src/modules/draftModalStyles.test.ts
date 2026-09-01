import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('audita superficies opacas del modal de borradores por tema y zona', async () => {
  const styles = await readSource('../styles.css');
  for (const [theme, surface, muted] of [
    ['dark', '#132035', '#0d192b'],
    ['light', '#ffffff', '#eef3f8'],
  ]) {
    const block = styles.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
    assert.match(block, new RegExp(`--draft-modal-surface:\\s*${surface}`));
    assert.match(block, new RegExp(`--draft-modal-surface-muted:\\s*${muted}`));
  }

  const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const surfaces = [
    '.draft-modal', '.draft-modal > header,.draft-modal__footer', '.draft-modal__body', '.draft-form fieldset',
    '.draft-modal :is(button,input,select),.draft-form input,.draft-form select', '.draft-color-control',
    '.draft-palette', '.draft-icon-grid--catalog', '.draft-sector-icons', '.draft-photo',
  ];
  for (const selector of surfaces) {
    const declarations = rules.find(([, candidate]) => candidate.trim() === selector)?.[2] ?? '';
    assert.match(declarations, /background:\s*var\(--draft-modal-surface(?:-muted)?\)/, `Falta base sólida en ${selector}`);
    assert.doesNotMatch(declarations, /color-mix\([^;]*transparent|\bopacity\s*:/, `Superficie translúcida en ${selector}`);
  }
  assert.match(styles, /\.draft-modal-backdrop\s*\{[^}]*color-mix\(in srgb,#000 58%,transparent\)/s);
  assert.doesNotMatch(rules.find(([, selector]) => selector.trim() === '.draft-modal')?.[2] ?? '', /\bopacity\s*:/);
});

test('matriz visual estática cubre diálogos, temas, viewports, scroll y apilamiento', async () => {
  const [styles, modal, sectors, workers, activities] = await Promise.all([
    readSource('../styles.css'), readSource('./Onboarding/editors/DraftEditorModal.tsx'),
    readSource('./Onboarding/editors/SectorDraftList.tsx'), readSource('./Onboarding/editors/WorkerDraftList.tsx'),
    readSource('./Onboarding/editors/ActivityDraftList.tsx'),
  ]);
  const matrix = ['Sectores', 'Trabajadores', 'Actividades'].flatMap(dialog =>
    ['dark', 'light'].flatMap(theme => ['desktop', 'mobile'].map(viewport => ({ dialog, theme, viewport }))));
  assert.equal(matrix.length, 12);
  for (const source of [sectors, workers, activities]) assert.match(source, /<DraftEditorModal/);
  assert.match(modal, /draft-modal-backdrop/);
  assert.match(modal, /draft-modal__body/);
  assert.match(modal, /draft-modal__footer/);
  assert.match(styles, /\.draft-modal-backdrop\s*\{[^}]*z-index:\s*1100/s);
  assert.match(styles, /\.draft-modal\s*\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto[^}]*overflow:hidden/s);
  assert.match(styles, /\.draft-modal__body\s*\{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/s);
  assert.match(styles, /\.draft-modal > header,\.draft-modal__footer\s*\{[^}]*background:var\(--draft-modal-surface\)[^}]*z-index:1/s);
  assert.match(styles, /\.draft-modal-backdrop\s*\{ align-items:flex-end; padding:0;/);
});
