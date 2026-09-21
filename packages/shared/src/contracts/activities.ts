export type ActivitySettlementMutation =
  | { mode: "FIXED"; fixedClubFee: number; fixedFeeFrequency: ActivityFeeFrequency; currencyCode: OperationalCurrency; clubSharePercentage: null; effectiveFrom: string }
  | { mode: "VARIABLE"; fixedClubFee: null; fixedFeeFrequency: null; currencyCode: null; clubSharePercentage: number; effectiveFrom: string };

import type { ActivityFeeFrequency, OperationalCurrency } from './onboarding.js';

/** Canonical write contract. Economic values only live under `settlement`. */
export interface ActivityMutationContract {
  updatedAt?: string;
  sectorId: string;
  /** Canonical operational owner. Must identify an active employee in this club. */
  responsibleEmployeeId: string;
  /** Person who receives (or owes) the economic result. Defaults to the operational responsible. */
  economicResponsiblePersonId?: string | null;
  /** @deprecated Compatibility input only. New writes use responsibleEmployeeId. */
  instructorId?: string | null;
  /** @deprecated Compatibility alias for economicResponsiblePersonId. */
  responsiblePersonId?: string | null;
  code?: string | null;
  name: string;
  modality?: string | null;
  color?: string | null;
  iconKey?: string | null;
  maxCapacity?: number | null;
  status?: "active" | "inactive";
  notes?: string | null;
  settlement: ActivitySettlementMutation;
}
