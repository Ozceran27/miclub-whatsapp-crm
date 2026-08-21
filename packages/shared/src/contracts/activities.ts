export type ActivitySettlementMutation =
  | { mode: "FIXED"; monthlyFixedFee: number; clubSharePercentage: null; effectiveFrom: string }
  | { mode: "VARIABLE"; monthlyFixedFee: null; clubSharePercentage: number; effectiveFrom: string };

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
  instructorCommissionPercent?: number;
  maxCapacity?: number | null;
  status?: "active" | "inactive";
  notes?: string | null;
  settlement: ActivitySettlementMutation;
}
