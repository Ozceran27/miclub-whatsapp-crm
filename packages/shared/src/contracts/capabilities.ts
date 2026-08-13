export const CLUB_CAPABILITIES = {
  DATA_MIGRATION: "DATA_MIGRATION",
} as const;

export type ClubCapabilityCode = typeof CLUB_CAPABILITIES[keyof typeof CLUB_CAPABILITIES];

export type ClubCapability = Readonly<{
  code: ClubCapabilityCode;
  source: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  actor: string;
}>;

export const hasClubCapability = (capabilities: readonly ClubCapability[], code: ClubCapabilityCode): boolean =>
  capabilities.some((capability) => capability.code === code);
