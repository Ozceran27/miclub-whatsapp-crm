import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiFetch, apiJson } from './api';

const response = (status: number, body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('incluye credenciales en todas las solicitudes', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let init: RequestInit | undefined;
  globalThis.fetch = async (_input, requestInit) => { init = requestInit; return response(200, {}); };
  await apiFetch('/summary');
  assert.equal(init?.credentials, 'include');
});

test('un 401 se revalida antes de notificar que la sesión expiró', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  t.after(() => { globalThis.fetch = originalFetch; Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true }); });
  const paths: string[] = []; let expiredEvents = 0;
  Object.defineProperty(globalThis, 'window', { value: { dispatchEvent: () => { expiredEvents += 1; } }, configurable: true });
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return paths.length === 1 ? response(401, { code: 'AUTHENTICATION_REQUIRED' }) : response(401, { authenticated: false });
  };
  await apiFetch('/members');
  assert.deepEqual(paths, ['/members', '/auth/me']);
  assert.equal(expiredEvents, 1);
});

test('un 403 no revalida ni cierra la sesión', async (t) => {
  const original = globalThis.fetch; let calls = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { calls += 1; return response(403, { message: 'Sin permiso' }); };
  await assert.rejects(apiJson('/templates'), (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN');
  assert.equal(calls, 1);
});

test('centraliza validación 422 y requestId', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => response(422, { message: 'Datos inválidos', errors: { email: 'inválido' }, requestId: 'req-42' });
  await assert.rejects(apiJson('/auth/register'), (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.requestId === 'req-42' && error.details !== undefined);
});

test('normaliza una caída de red', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(apiFetch('/summary'), (error: unknown) => error instanceof ApiError && error.code === 'NETWORK_ERROR');
});

test('propaga cancelación mediante AbortController', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  const controller = new AbortController();
  const pending = apiFetch('/summary', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_CANCELLED');
});
