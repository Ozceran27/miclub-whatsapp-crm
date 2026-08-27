import type { ClubCapabilityCode } from "./capabilities.js";

export const COMMERCIAL_PLAN_CODES = ["FREE", "SOCIAL", "COMPLEX", "CLUB"] as const;
export type CommercialPlanCode = typeof COMMERCIAL_PLAN_CODES[number];
export type CommercialPlan = Readonly<{
  code: CommercialPlanCode;
  name: string;
  commercialClass: "free" | "paid";
  capabilities: readonly ClubCapabilityCode[];
}>;
