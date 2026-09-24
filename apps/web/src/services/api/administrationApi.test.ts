import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdministrationSectors } from './administrationApi';

void test('Sectores carga todas las páginas y no pierde registros después del límite de 100', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const pages: number[] = [];
  globalThis.fetch = (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const page = Number(url.searchParams.get('page'));
    pages.push(page);
    const count = page === 1 ? 100 : 1;
    const items = Array.from({ length: count }, (_, index) => ({ id: `sector-${(page - 1) * 100 + index}` }));
    return Promise.resolve(new Response(JSON.stringify({ items, total: 101, page, pageSize: 100 }), { status: 200 }));
  };
  const result = await getAdministrationSectors();
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.items.length, 101);
  assert.equal(result.items.at(-1)?.id, 'sector-100');
});
