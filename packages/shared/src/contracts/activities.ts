export type ActivitySettlementMutation =
  | { mode: "FIXED"; fixedClubFee: number; fixedFeeFrequency: ActivityFeeFrequency; currencyCode: OperationalCurrency; clubSharePercentage: null; effectiveFrom: string }
  | { mode: "VARIABLE"; fixedClubFee: null; fixedFeeFrequency: null; currencyCode: null; clubSharePercentage: number; effectiveFrom: string };

import type { ActivityFeeFrequency, OperationalCurrency } from './onboarding.js';

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
  instructorCommissionPercent?: number;
  maxCapacity?: number | null;
  status?: "active" | "inactive";
  notes?: string | null;
  settlement: ActivitySettlementMutation;
}
