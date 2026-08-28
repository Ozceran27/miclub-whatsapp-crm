import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaginatedList } from './modules/Administration/PaginatedList';

Object.assign(globalThis, { React });

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

test('la utilidad sr-only conserva los nombres accesibles de selectores visuales', async () => {
  const [styles, sectors, activities] = await Promise.all([
    readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    readFile(new URL('./modules/Onboarding/editors/SectorDraftList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./modules/Onboarding/editors/ActivityDraftList.tsx', import.meta.url), 'utf8'),
  ]);
  const srOnlyRule = styles.match(/\.sr-only\s*\{([^}]*)\}/)?.[1];

  assert.ok(srOnlyRule, 'Falta la utilidad .sr-only');
  assert.match(srOnlyRule, /position:\s*absolute/);
  assert.match(srOnlyRule, /width:\s*1px/);
  assert.match(srOnlyRule, /height:\s*1px/);
  assert.match(srOnlyRule, /margin:\s*-1px/);
  assert.match(srOnlyRule, /overflow:\s*hidden/);
  assert.match(srOnlyRule, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  assert.match(srOnlyRule, /clip-path:\s*inset\(50%\)/);
  assert.match(srOnlyRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(srOnlyRule, /(?:display:\s*none|visibility:\s*hidden)/);
  assert.match(styles, /\.sr-only\.sr-only-focusable:focus/);
  assert.match(styles, /\.sr-only\.sr-only-focusable:focus-within/);

  assert.match(sectors, /<span className="sr-only">\{icon\.name\}<\/span>/);
  assert.match(sectors, /<span className="sr-only">\{color\.name\}, \{color\.hex\}<\/span>/);
  assert.match(activities, /<span className="sr-only">\{key\}<\/span>/);
});

test('los catálogos de iconos son adaptables y no generan scroll horizontal', async () => {
  const [styles, activities] = await Promise.all([
    readFile(new URL('./styles.css', import.meta.url), 'utf8'),
    readFile(new URL('./modules/Onboarding/editors/ActivityDraftList.tsx', import.meta.url), 'utf8'),
  ]);
  const iconGridRule = styles.match(/\.draft-icon-grid\s*\{([^}]*)\}/)?.[1];

  assert.ok(iconGridRule, 'Falta la cuadrícula de iconos');
  assert.match(iconGridRule, /grid-template-columns:\s*repeat\(auto-fill,minmax\(44px,1fr\)\)/);
  assert.doesNotMatch(styles, /\.draft-icon-grid\s*\{[^}]*repeat\(\d+,/s, 'La cuadrícula no debe fijar columnas en escritorio ni móvil');
  assert.match(styles, /\.draft-icon-grid label\s*\{[^}]*aspect-ratio:\s*1[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s);
  assert.match(styles, /\.draft-form fieldset\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.draft-icon-catalog,\.draft-sector-icons\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden/s);
  assert.match(activities, /className="draft-icon-catalog"/);
  assert.match(activities, /categories\.map\(category=><section/);
  assert.match(activities, /aria-label=\{`\$\{key\} · \$\{category\}`\}/);
});

test('los modales de borradores usan superficies y texto semánticos en ambos temas', async () => {
  const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  const expectedThemeTokens = {
    dark: {
      '--color-card': 'rgba(19, 31, 53, 0.88)',
      '--color-card-muted': 'rgba(9, 18, 34, 0.46)',
      '--color-text': '#f0f4ff',
      '--color-text-strong': '#f4f8ff',
    },
    light: {
      '--color-card': 'rgba(255, 255, 255, 0.96)',
      '--color-card-muted': '#eef3f8',
      '--color-text': '#152033',
      '--color-text-strong': '#0b1220',
    },
  } as const;

  for (const [theme, tokens] of Object.entries(expectedThemeTokens)) {
    const themeBlock = styles.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(themeBlock, `Falta la definición de tokens del tema ${theme}`);
    for (const [token, value] of Object.entries(tokens)) {
      const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(themeBlock, new RegExp(`${token}\\s*:\\s*${escapedValue}\\s*;`));
    }
  }

  const modalRules = [...styles.matchAll(/([^{}]*\.draft-modal[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(modalRules.length > 0, 'No se encontraron reglas del modal de borradores');
  for (const [, selector, declarations] of modalRules) {
    assert.doesNotMatch(declarations, /background(?:-color)?\s*:\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i, `Fondo blanco hardcodeado en ${selector.trim()}`);
  }

  assert.match(styles, /\.draft-modal\s*\{[^}]*background:\s*var\(--color-card\)[^}]*color:\s*var\(--color-text\)/s);
  assert.match(styles, /\.draft-modal\s*>\s*header,\.draft-modal__footer\s*\{[^}]*background:\s*var\(--color-card\)/s);
  assert.match(styles, /\.draft-modal__body\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s);
});
