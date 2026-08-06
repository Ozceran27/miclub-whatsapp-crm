export type SessionTenant = {
  clubId?: string | null;
  membershipId?: string | null;
  permissions?: readonly string[];
};

export const readSessionTenant = (user?: SessionTenant | null) => ({
  clubId: user?.clubId ?? null,
  membershipId: user?.membershipId ?? null
});

/** Forces tenant-owned component state to be discarded when the selected club changes. */
export const tenantModuleKey = (clubId: string | null, moduleId: string) =>
  `${clubId ?? 'no-club'}:${moduleId}`;
