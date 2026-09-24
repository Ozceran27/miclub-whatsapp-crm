import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdministrationSummaryResponse } from '@miclub/shared';
import { AdministrationHeaderCards } from './AdministrationHeaderCards';
import { administrationSummaryStatus } from './useAdministrationSummary';

Object.assign(globalThis, { React });

const emptyClubSummary = {
  totals: {
    enrollments: { value: 0, comparison: null },
    workers: { value: 0, comparison: null },
    activities: { value: 0, comparison: null },
  },
  cards: [{ id: 'roles', label: 'Roles', value: 0 }],
  capacity: { sectorUtilizationAverage: null, sectorsWithData: 0, sectorsWithoutData: 0, sectors: [] },
  rankings: { activitiesByEnrollments: [] },
  trends: { points: [] },
} as unknown as AdministrationSummaryResponse;

void test('un club sin operaciones muestra ceros reales y capacidad desconocida', () => {
  assert.equal(administrationSummaryStatus(emptyClubSummary, false, null), 'ready');
  const html = renderToStaticMarkup(createElement(AdministrationHeaderCards, { summary: emptyClubSummary }));
  assert.match(html, /Inscripciones activas/);
  assert.match(html, /0 trabajadores/);
  assert.match(html, /0 actividades activas/);
  assert.match(html, /Capacidad operativa[\s\S]*?<p class="economy-top-card__value[^>]*">—<\/p>/);
});

void test('error y carga tienen prioridad sobre datos anteriores', () => {
  assert.equal(administrationSummaryStatus(emptyClubSummary, true, null), 'loading');
  assert.equal(administrationSummaryStatus(emptyClubSummary, false, new Error('Red')), 'error');
  assert.equal(administrationSummaryStatus(null, false, null), 'empty');
});
