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
    assert.match(markup, new RegExp(`<span class="onboarding-money-input__prefix" aria-hidden="true">${prefix.replace('$', '\\$')}</span>`));
    assert.match(markup, /<input name="fixedCompensationAmount"[^>]*type="number"/);
    assert.match(markup, new RegExp(`aria-label="Monto de remuneración fija en ${currency}"`));
  }
});

test('usa layout semántico, controles propios y limpia la remuneración desactivada',async()=>{const source=await readFile(new URL('./WorkerDraftList.tsx',import.meta.url),'utf8');assert.match(source,/className="draft-photo__avatar"/);assert.match(source,/'Seleccionar foto'/);assert.match(source,/className="draft-photo__input"/);assert.match(source,/className="worker-compensation-toggle"/);assert.match(source,/className="worker-compensation-fields"/);assert.match(source,/fixedCompensationAmount:hasFixedCompensation\?Number[\s\S]*:null/);assert.match(source,/currencyCode:hasFixedCompensation\?currency:null/);});

test('valida tipo y tamaño de foto antes de subir',async()=>{const {validateWorkerPhoto,WORKER_PHOTO_MAX_BYTES}=await import('./WorkerDraftList');assert.match(validateWorkerPhoto({type:'image/gif',size:10} as File)??'',/Formato no admitido/);assert.match(validateWorkerPhoto({type:'image/png',size:WORKER_PHOTO_MAX_BYTES+1} as File)??'',/5 MB/);assert.equal(validateWorkerPhoto({type:'image/webp',size:100} as File),null);});

test('revoca previews al reemplazar, eliminar y desmontar',async()=>{const source=await readFile(new URL('./WorkerDraftList.tsx',import.meta.url),'utf8');assert.match(source,/const revokePreview=.*URL\.revokeObjectURL/);assert.match(source,/useEffect\(\(\)=>\(\)=>\{if\(previewRef\.current\)URL\.revokeObjectURL/);assert.match(source,/const uploaded=await uploadOnboardingPhoto\(file\),old=photoFileId;revokePreview\(\)/);assert.match(source,/const removePhoto=async\(\)=>\{const id=photoFileId;revokePreview\(\)/);});
