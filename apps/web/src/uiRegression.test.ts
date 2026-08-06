import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaginatedList } from './modules/Administration/PaginatedList';

const noop = () => undefined;
const renderList = (overrides: Partial<Parameters<typeof PaginatedList>[0]> = {}) => renderToStaticMarkup(createElement(PaginatedList, {
  id: 'people', eyebrow: 'Personas', title: 'Socios', description: 'Listado', searchLabel: 'Buscar', search: '', status: '', statusLabel: 'Estado',
  statusOptions: [{ value: 'ACTIVE', label: 'Activo' }], loading: false, error: null, total: 1, page: 1, pageSize: 20,
  emptyMessage: 'No hay socios para estos filtros.', onSearchChange: noop, onStatusChange: noop, onFilter: noop, onPageChange: noop, onRetry: noop,
  children: createElement('table', null, createElement('tbody', null, createElement('tr', null, createElement('td', null, 'Ada')))), ...overrides,
}));

test('checklist UI: loading, error y vacío son estados explícitos y excluyentes', () => {
  const loading = renderList({ loading: true });
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"[^>]*>Cargando resultados/);
  assert.doesNotMatch(loading, />Ada</);

  const error = renderList({ error: 'Falló la consulta', total: 0 });
  assert.match(error, /role="alert"/);
  assert.match(error, /Falló la consulta/);
  assert.match(error, /Total no disponible/);
  assert.doesNotMatch(error, /0 en total/);
  assert.doesNotMatch(error, /No hay socios/);

  const empty = renderList({ total: 0 });
  assert.match(empty, /No hay socios para estos filtros/);
  assert.doesNotMatch(empty, />Ada</);
});

test('checklist UI: filtros y paginación exponen controles con nombre y límites', () => {
  const first = renderList({ total: 41, page: 1 });
  assert.match(first, /<label><span>Buscar<\/span><input type="search"/);
  assert.match(first, /<label><span>Estado<\/span><select/);
  assert.match(first, /<button[^>]*type="submit"[^>]*>Aplicar filtros/);
  assert.match(first, /aria-label="Paginación de Socios"/);
  assert.match(first, /<button type="button" disabled="">Anterior/);
  assert.match(first, /Página <strong>1<\/strong> de <strong>3/);

  const last = renderList({ total: 41, page: 3 });
  assert.match(last, /<button type="button" disabled="">Siguiente/);
});

test('checklist UI: modal, Escape, teclado, restauración de foco y foco visible permanecen cubiertos', async () => {
  const [modal, list, styles] = await Promise.all([
    readFile(new URL('./modules/Administration/MovementDetailModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./modules/Administration/MovementList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /previousFocus\?\.focus\(\)/);
  assert.match(list, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(styles, /:focus-visible/);
});
