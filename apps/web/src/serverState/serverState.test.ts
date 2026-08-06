import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from './client';
import { queryKey, keys } from './queryKeys';
import { policies } from './policies';

const policy = { ...policies.dashboard, staleTime: 60_000, retry: 0 };

test('deduplicates concurrent requests for an identical complete key', async () => {
  const client = new QueryClient(); let calls = 0;
  const fn = async () => { calls += 1; await Promise.resolve(); return 42; };
  const key = queryKey({ clubId: 'a', resource: 'summary', filters: { year: 2026 }, pagination: { page: 1, pageSize: 20 } });
  assert.deepEqual(await Promise.all([client.fetchQuery(key, fn, policy), client.fetchQuery(key, fn, policy)]), [42, 42]);
  assert.equal(calls, 1);
});

test('tenant keys are isolated and removing one tenant does not clear another', async () => {
  const client = new QueryClient();
  await client.fetchQuery(keys.home('a'), async () => 'A', policy);
  await client.fetchQuery(keys.home('b'), async () => 'B', policy);
  client.removeClub('a');
  assert.equal(client.snapshot(keys.home('a')).data, undefined);
  assert.equal(client.snapshot(keys.home('b')).data, 'B');
});

test('tenant removal aborts an in-flight request', async () => {
  const client = new QueryClient(); let aborted = false;
  const pending = client.fetchQuery(keys.home('a'), ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); })), policy);
  client.removeClub('a');
  await assert.rejects(pending, /Aborted/); assert.equal(aborted, true);
});

test('pagination and filters are stable, explicit portions of a key', () => {
  const first = queryKey({ clubId: 'a', resource: 'history', filters: { status: 'sent' }, pagination: { page: 1, pageSize: 20 } });
  const second = queryKey({ clubId: 'a', resource: 'history', filters: { status: 'sent' }, pagination: { page: 2, pageSize: 20 } });
  assert.notDeepEqual(first, second); assert.equal(first[5], 'v1');
});

test('failed refresh preserves successful cached data for partial-error UIs', async () => {
  const client = new QueryClient(); const key = keys.home('a');
  await client.fetchQuery(key, async () => ({ finance: 'ok' }), policy);
  await assert.rejects(client.fetchQuery(key, async () => { throw new Error('sector unavailable'); }, policy, true));
  assert.deepEqual(client.snapshot(key).data, { finance: 'ok' }); assert.match(String(client.snapshot(key).error), /sector unavailable/);
});

test('mutation cache updates and targeted invalidation only refetch matching resources', async () => {
  const client = new QueryClient(); const summary = keys.economy('a', 'summary'); const catalog = keys.crm('a', 'templates');
  client.setQueryData(summary, { total: 1 }); client.setQueryData(catalog, ['base']); client.setQueryData(catalog, (old: string[] | undefined) => [...(old ?? []), 'new']);
  client.invalidateQueries(key => key[1] === 'a' && key[2] === 'economy-summary');
  assert.equal(client.snapshot(summary).updatedAt, 0); assert.deepEqual(client.snapshot(catalog).data, ['base', 'new']); assert.notEqual(client.snapshot(catalog).updatedAt, 0);
});
