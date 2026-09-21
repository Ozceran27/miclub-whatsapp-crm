import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

void test('los accesos rápidos respetan orden, estado, accesibilidad y modales reales', () => {
  const actions = read('./AdministrationActions.tsx');
  const module = read('../AdministrationModule.tsx');

  for (const operation of ['sector', 'worker', 'activity']) {
    assert.match(actions, new RegExp(`operation: '${operation}'`));
  }
  const labels = [...actions.matchAll(/label: '([^']+)'/g)].map(match => match[1]);
  const catalogSource = actions.slice(actions.indexOf('export const administrationActions'), actions.indexOf('] as const;'));
  assert.deepEqual(labels.slice(0, 10), [
    'Cargar Movimiento', 'Cargar Inscripción', 'Cargar Cuota', 'Crear Reserva', 'Cargar Socio',
    'Gestionar Sectores', 'Gestionar Actividades', 'Gestionar Trabajadores', 'Gestionar Categorías', 'Gestionar Membresías',
  ]);
  assert.equal((catalogSource.match(/availability: 'enabled'/g) ?? []).length, 5);
  assert.equal((catalogSource.match(/availability: 'coming-soon'/g) ?? []).length, 5);
  assert.match(actions, /if \(!disabled\) run\?\.\(\)/);
  assert.match(actions, /role="tooltip"/);
  assert.match(actions, /aria-disabled=\{disabled\}/);
  assert.match(actions, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(actions, /event\.key === 'Escape'/);
  assert.match(module, /onCreateSector=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-sector'\)\)\}/);
  assert.match(module, /onCreateWorker=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-worker'\)\)\}/);
  assert.match(module, /onCreateActivity=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-activity'\)\)\}/);

  assert.match(read('./SectorList.tsx'), /addEventListener\('miclub:create-sector'/);
  assert.match(read('./WorkerList.tsx'), /addEventListener\('miclub:create-worker'/);
  assert.match(read('./ActivityList.tsx'), /addEventListener\('miclub:create-activity'/);
  assert.doesNotMatch(module, /administration-anchor-nav/);
});

void test('la administración de sectores presenta el nuevo resumen y editor visual', () => {
  const list = read('./SectorList.tsx');
  const modal = read('./SectorDetailModal.tsx');
  assert.match(list, /Capacidad ociosa/);
  assert.match(list, /Rentabilidad operativa anual/);
  assert.match(list, /Sector del sistema/);
  assert.doesNotMatch(list, /<small>\{sector\.code\}<\/small>/);
  assert.doesNotMatch(list, /Tipo de capacidad/);
  assert.doesNotMatch(list, /<small>Horario<\/small>/);
  assert.match(modal, /<SectorIconPicker value=\{iconKey\}/);
  assert.match(modal, /<ConfigurationColorPicker value=\{color\}/);
  assert.match(modal, /Eliminar sector/);
  assert.match(modal, /sector\.isSystem \? \{\} : \{ iconKey \}/);
  assert.match(modal, /currentManagerMissing/);
  assert.match(list, /creationError && <p className="activity-form__error" role="alert">/);
  assert.match(list, /annualOperatingProfitability == null/);
});

void test('la foto temporal del trabajador sólo se descarta si el formulario no se guardó', () => {
  const modal = read('./WorkerDetailModal.tsx');
  assert.match(modal, /if\(temporaryPhotoRef\.current\)void deleteOnboardingPhoto/);
  assert.match(modal, /await onSave\([\s\S]+temporaryPhotoRef\.current=null/);
  assert.match(modal, /temporaryPhotoRef\.current=null; if\(previewUrlRef\.current\)\{URL\.revokeObjectURL/);
});
