export const CONTRACT_VERSION = 'v1' as const;

export type QueryScope = {
  clubId: string | null;
  resource: string;
  filters?: Readonly<Record<string, unknown>>;
  pagination?: { page: number; pageSize: number };
  version?: string;
};

const normalized = (value: Readonly<Record<string, unknown>> | undefined) =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)));

/** Every server-state key carries the complete tenant and contract identity. */
export const queryKey = ({ clubId, resource, filters, pagination, version = CONTRACT_VERSION }: QueryScope) =>
  ['club', clubId ?? 'no-club', resource, normalized(filters), pagination ?? { page: 1, pageSize: 0 }, version] as const;

export const keys = {
  home: (clubId: string | null) => queryKey({ clubId, resource: 'home-dashboard' }),
  administrationSummary: (clubId: string | null) => queryKey({ clubId, resource: 'administration-summary' }),
  economy: (clubId: string | null, resource: string) => queryKey({ clubId, resource: `economy-${resource}` }),
  crm: (clubId: string | null, resource: string, page = 1, pageSize = 0) => queryKey({ clubId, resource: `crm-${resource}`, pagination: { page, pageSize } }),
};

