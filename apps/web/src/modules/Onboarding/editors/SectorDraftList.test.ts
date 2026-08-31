import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SECTOR_ICON_CATALOG } from '../../../../../../packages/shared/src/sectorVisualCatalog';

const historicalKeys = [
  'soccer', 'tennis', 'basketball', 'volleyball', 'swimming', 'gym', 'running', 'hockey',
  'administration', 'documents', 'management', 'treasury', 'billing', 'cashier',
  'social-hall', 'events', 'playground', 'library', 'health', 'first-aid', 'wellness',
  'maintenance', 'cleaning', 'gardening', 'security', 'marketing', 'communications', 'press',
  'restaurant', 'cafe', 'grill', 'bar', 'parking', 'reception', 'transport', 'other',
] as const;

void test('el catálogo plano ofrece al menos 50 iconos únicos y conserva sus claves históricas', () => {
  assert.ok(SECTOR_ICON_CATALOG.length >= 50);
  assert.equal(new Set(SECTOR_ICON_CATALOG.map(icon => icon.key)).size, SECTOR_ICON_CATALOG.length);
  assert.equal(new Set(SECTOR_ICON_CATALOG.map(icon => icon.glyph)).size, SECTOR_ICON_CATALOG.length);
  const keys = new Set(SECTOR_ICON_CATALOG.map(icon => icon.key));
  historicalKeys.forEach(key => assert.ok(keys.has(key), `Falta la clave histórica ${key}`));
});

void test('el editor muestra una sola grilla sin búsqueda ni secciones por categoría', async () => {
  const source = await readFile(new URL('./SectorDraftList.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Elegí una plantilla|name="templateId"|Filtrar iconos|iconFilter|categoryNames|visibleIcons/);
  assert.equal(source.match(/className="draft-icon-grid draft-icon-grid--catalog"/g)?.length, 1);
  assert.match(source, /SECTOR_ICON_CATALOG\.map\(icon=>/);
  assert.doesNotMatch(source, /Object\.entries|icon\.category===|<section key=\{category\}/);
});

void test('cada opción de la grilla es un radio con nombre y ayudas accesibles', async () => {
  const source = await readFile(new URL('./SectorDraftList.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="radio" name="iconKey" value=\{icon\.key\} required/);
  assert.match(source, /aria-label=\{icon\.name\}/);
  assert.match(source, /title=\{icon\.name\}/);
  assert.match(source, /className="sr-only">\{icon\.name\}/);
});
