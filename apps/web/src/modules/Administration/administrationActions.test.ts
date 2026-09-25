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
  assert.equal((catalogSource.match(/availability: 'enabled'/g) ?? []).length, 6);
  assert.equal((catalogSource.match(/availability: 'coming-soon'/g) ?? []).length, 4);
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
  const fields = read('./SectorConfigurationFields.tsx');
  assert.doesNotMatch(list, /Capacidad ociosa/);
  assert.match(list, /Capacidad utilizada/);
  assert.match(list, /Rentabilidad operativa anual/);
  assert.match(list, /Sector del sistema/);
  assert.doesNotMatch(list, /<small>\{sector\.code\}<\/small>/);
  assert.doesNotMatch(list, /Tipo de capacidad/);
  assert.doesNotMatch(list, /<small>Horario<\/small>/);
  assert.match(fields, /<SectorIconPicker value=\{iconKey\}/);
  assert.match(fields, /<ConfigurationColorPicker value=\{color\}/);
  assert.match(modal, /Editar sector/);
  assert.match(list, /<SectorConfigurationFields/);
  assert.match(modal, /<SectorConfigurationFields/);
  assert.match(modal, /Eliminar sector/);
  assert.match(modal, /canEdit && !sector\.isSystem/);
  assert.match(fields, /name="managerPersonId"/);
  assert.match(fields, /currentManagerMissing/);
  assert.match(list, /creationError && <p className="activity-form__error" role="alert">/);
  assert.match(list, /annualOperatingProfitability == null/);
});

void test('la foto temporal del trabajador sólo se descarta si el formulario no se guardó', () => {
  const modal = read('./WorkerDetailModal.tsx');
  assert.match(modal, /if\(temporaryPhotoRef\.current\)void deleteOnboardingPhoto/);
  assert.match(modal, /await onSave\([\s\S]+temporaryPhotoRef\.current=null/);
  assert.match(modal, /temporaryPhotoRef\.current=null; if\(previewUrlRef\.current\)\{URL\.revokeObjectURL/);
});

void test('los badges pendientes y las condiciones económicas usan la presentación compacta solicitada', () => {
  const activity = read('./ActivityCreateEditModal.tsx');
  const styles = read('../../styles.css');

  assert.match(activity, /<FormattedValueInput kind="percent" name="clubSharePercentage"/);
  assert.match(activity, /activity-terms__modes/);
  assert.match(activity, /activity-terms__details/);
  assert.match(styles, /\.administration-action-card__badge[\s\S]*font-weight: 500;[\s\S]*right:7px;[\s\S]*top:7px;/);
  assert.match(styles, /\.activity-terms__percentage \{ max-width:180px; \}/);
});

void test('la lista de actividades abre filas accesibles y concentra mutaciones en la ficha', () => {
  const list = read('./ActivityList.tsx');
  const detail = read('./ActivityDetailModal.tsx');
  assert.match(list, /className="activity-list__row" tabIndex=\{0\} role="button"/);
  assert.match(list, /event\.key==='Enter'\|\|event\.key===' '/);
  assert.doesNotMatch(list, /<th>Acciones<\/th>/);
  assert.match(detail, /Editar actividad/);
  assert.match(detail, /Archivar actividad/);
  assert.match(detail, /Desactivar':'Activar/);
  assert.match(detail, /Próximas vigencias/);
  assert.match(detail, /loadState\.enrollments==='error'/);
  assert.match(detail, /loadState\.movements==='error'/);
  assert.match(detail, /loadState\.terms==='error'/);
});
