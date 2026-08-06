import { useCallback, useEffect, useState } from 'react';
import type { ResourcePolicy } from './policies';

type Key = readonly unknown[];
type Entry<T = unknown> = { data?: T; error?: unknown; updatedAt: number; promise?: Promise<T>; controller?: AbortController; listeners: Set<() => void>; gc?: ReturnType<typeof setTimeout> };
const serialize = (key: Key) => JSON.stringify(key);

export class QueryClient {
  private cache = new Map<string, Entry>();
  private entry<T>(key: Key): Entry<T> { const id = serialize(key); let value = this.cache.get(id); if (!value) { value = { updatedAt: 0, listeners: new Set() }; this.cache.set(id, value); } return value as Entry<T>; }
  async fetchQuery<T>(key: Key, queryFn: (context: { signal: AbortSignal }) => Promise<T>, policy: ResourcePolicy, force = false) {
    const entry = this.entry<T>(key);
    if (!force && entry.data !== undefined && Date.now() - entry.updatedAt < policy.staleTime) return entry.data;
    if (entry.promise) return entry.promise;
    const controller = new AbortController(); entry.controller = controller;
    const run = async () => { let attempt = 0; while (true) { try { return await queryFn({ signal: controller.signal }); } catch (error) { if (controller.signal.aborted || attempt++ >= policy.retry) throw error; } } };
    entry.promise = run().then(data => { entry.data = data; entry.error = undefined; entry.updatedAt = Date.now(); return data; }, error => { entry.error = error; throw error; }).finally(() => { entry.promise = undefined; entry.controller = undefined; entry.listeners.forEach(listener => listener()); });
    entry.listeners.forEach(listener => listener()); return entry.promise;
  }
  snapshot<T>(key: Key) { return this.entry<T>(key); }
  subscribe(key: Key, listener: () => void, gcTime: number) { const entry = this.entry(key); if (entry.gc) clearTimeout(entry.gc); entry.listeners.add(listener); return () => { entry.listeners.delete(listener); if (!entry.listeners.size) entry.gc = setTimeout(() => this.cache.delete(serialize(key)), gcTime); }; }
  invalidateQueries(predicate: (key: Key) => boolean) { for (const [raw, entry] of this.cache) if (predicate(JSON.parse(raw))) { entry.updatedAt = 0; entry.listeners.forEach(listener => listener()); } }
  cancelClub(clubId: string | null) { for (const [raw, entry] of this.cache) if (JSON.parse(raw)[1] === (clubId ?? 'no-club')) entry.controller?.abort(); }
  removeClub(clubId: string | null) { this.cancelClub(clubId); for (const raw of this.cache.keys()) if (JSON.parse(raw)[1] === (clubId ?? 'no-club')) this.cache.delete(raw); }
  setQueryData<T>(key: Key, updater: T | ((old: T | undefined) => T)) { const entry = this.entry<T>(key); entry.data = typeof updater === 'function' ? (updater as (old: T | undefined) => T)(entry.data) : updater; entry.updatedAt = Date.now(); entry.listeners.forEach(listener => listener()); }
}

export const queryClient = new QueryClient();

export function useServerQuery<T>({ key, queryFn, policy }: { key: Key; queryFn: (context: { signal: AbortSignal }) => Promise<T>; policy: ResourcePolicy }) {
  const [, render] = useState(0); const refresh = useCallback(() => render(value => value + 1), []); const id = serialize(key);
  useEffect(() => queryClient.subscribe(key, refresh, policy.gcTime), [id, policy.gcTime, refresh]);
  const snapshot = queryClient.snapshot<T>(key);
  useEffect(() => { if (snapshot.data === undefined || Date.now() - snapshot.updatedAt >= policy.staleTime) void queryClient.fetchQuery(key, queryFn, policy).catch(() => undefined); }, [id, queryFn, policy, snapshot.updatedAt]);
  const refetch = useCallback(() => queryClient.fetchQuery(key, queryFn, policy, true), [id, queryFn, policy]);
  return { data: snapshot.data, error: snapshot.error, loading: snapshot.data === undefined && snapshot.error === undefined, refetch };
}
