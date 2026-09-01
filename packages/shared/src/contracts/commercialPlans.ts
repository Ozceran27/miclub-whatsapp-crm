import type { ClubCapabilityCode } from "./capabilities.js";

export const COMMERCIAL_PLAN_CODES = ["FREE", "SOCIAL", "COMPLEX", "CLUB"] as const;
export type CommercialPlanCode = typeof COMMERCIAL_PLAN_CODES[number];
export type CommercialPlan = Readonly<{
  code: CommercialPlanCode;
  name: string;
  description: string;
  targetAudience: string;
  highlightedFeatures: readonly string[];
  displayOrder: number;
  recommended: boolean;
  ctaText: string;
  priceLabel: string;
  commercialClass: "free" | "paid";
  capabilities: readonly ClubCapabilityCode[];
  migrationAvailable: boolean;
}>;
