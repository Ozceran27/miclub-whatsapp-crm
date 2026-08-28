import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperationalCurrency } from '@miclub/shared';

const prefixes: Record<OperationalCurrency, string> = { ARS: '$', USD: 'US$', BRL: 'R$', EUR: '€' };

test('muestra el prefijo de la moneda cuando se activa la remuneración fija', async () => {
  // tsx ejecuta JSX con el runtime clásico fuera de Vite.
  Object.assign(globalThis, { React });
  const { FixedCompensationFields } = await import('./WorkerDraftList');
  const source = await readFile(new URL('./WorkerDraftList.tsx', import.meta.url), 'utf8');
  assert.match(source, /hasFixedCompensation&&<FixedCompensationFields/);

  for (const [currency, prefix] of Object.entries(prefixes) as [OperationalCurrency, string][]) {
    const markup = renderToStaticMarkup(React.createElement(FixedCompensationFields, { currency, worker: null }));
    assert.match(markup, new RegExp(`<span aria-hidden="true">${prefix.replace('$', '\\$')}</span>`));
    assert.match(markup, /name="fixedCompensationAmount" type="number"/);
    assert.match(markup, new RegExp(`Monto de remuneración fija en ${currency}; la periodicidad`));
  }
});
