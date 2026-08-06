export type ResourcePolicy = { staleTime: number; gcTime: number; retry: number; refetchOnWindowFocus: boolean };

export const policies = {
  dashboard: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: true },
  catalog: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 2, refetchOnWindowFocus: false },
  paginated: { staleTime: 15_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  realtime: { staleTime: 0, gcTime: 60_000, retry: 0, refetchOnWindowFocus: true },
} as const satisfies Record<string, ResourcePolicy>;

