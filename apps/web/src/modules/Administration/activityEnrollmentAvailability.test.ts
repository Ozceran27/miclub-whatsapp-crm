import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnrollmentAvailability } from './ActivityList';

void test('muestra el conteo activo sólo cuando las inscripciones están habilitadas', () => {
  const enabled = renderToStaticMarkup(createElement(EnrollmentAvailability, { enabled: true, count: 7 }));
  const disabledWithHistory = renderToStaticMarkup(createElement(EnrollmentAvailability, { enabled: false, count: 7 }));
  const enabledWithoutEnrollments = renderToStaticMarkup(createElement(EnrollmentAvailability, { enabled: true, count: 0 }));

  assert.match(enabled, /aria-label="Inscripciones habilitadas, 7 inscriptos activos"/);
  assert.match(enabled, /<strong aria-hidden="true">7<\/strong>/);
  assert.match(disabledWithHistory, /aria-label="Inscripciones deshabilitadas"/);
  assert.doesNotMatch(disabledWithHistory, /<strong/);
  assert.match(enabledWithoutEnrollments, /aria-label="Inscripciones habilitadas, 0 inscriptos activos"/);
  assert.match(enabledWithoutEnrollments, /<strong aria-hidden="true">0<\/strong>/);
});
