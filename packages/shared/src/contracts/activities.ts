export type ActivitySettlementMutation =
  | { mode: "FIXED"; fixedClubFee: number; fixedFeeFrequency: ActivityFeeFrequency; clubSharePercentage: null; effectiveFrom: string }
  | { mode: "VARIABLE"; fixedClubFee: null; fixedFeeFrequency: null; clubSharePercentage: number; effectiveFrom: string };

import type { ActivityFeeFrequency } from './onboarding.js';

/** Canonical write contract. Economic values only live under `settlement`. */
export interface ActivityMutationContract {
  updatedAt?: string;
  sectorId: string;
  instructorId?: string | null;
  code?: string | null;
  name: string;
  modality?: string | null;
  color?: string | null;
  iconKey?: string | null;
  enrollmentFee?: number;
  enrollmentFeeFrequency?: ActivityFeeFrequency;
  instructorCommissionPercent?: number;
  maxCapacity?: number | null;
  status?: "active" | "inactive";
  notes?: string | null;
  settlement: ActivitySettlementMutation;
}
