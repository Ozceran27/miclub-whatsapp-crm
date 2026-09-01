import type { AdministrationMetricComparison, AdministrationSummaryResponse, AdministrationTrendDirection } from "@miclub/shared";
import { getAdministrationSummaryRows } from "../../repositories/administration/administrationSummaryRepository.js";
import { getAdministrationSectorCapacities } from "../../repositories/administration/administrationReadRepository.js";
import { getLastCompleteMonthWindows } from "../economyDomain.js";

const toNumber = (value: string | number | null | undefined): number => Number(value ?? 0);

const metric = (value: number, comparison: AdministrationMetricComparison | null = null) => ({ value, comparison });

export type SectorCapacityInput =
  | { capacityMode: "ENROLLMENTS"; configuredCapacity: number; activeEnrollments: number }
  | { capacityMode: "INCOME"; historicalClosedMonthlyIncome: readonly number[]; currentMonthIncome: number };

/** Mirrors the canonical SQL read model. A missing/zero income record is unknown,
 * while enrollment overcapacity intentionally keeps utilization above 100%. */
export const calculateSectorCapacity = (input: SectorCapacityInput) => {
  const maximumCapacity = input.capacityMode === "ENROLLMENTS"
    ? input.configuredCapacity
    : input.historicalClosedMonthlyIncome.length ? Math.max(...input.historicalClosedMonthlyIncome) : null;
  if (maximumCapacity == null || !Number.isFinite(maximumCapacity) || maximumCapacity <= 0)
    return { maximumCapacity: null, currentUsage: null, utilizationPercentage: null, idlePercentage: null, dataStatus: "NO_DATA" as const };
  const currentUsage = input.capacityMode === "ENROLLMENTS" ? input.activeEnrollments : input.currentMonthIncome;
  const utilizationPercentage = currentUsage * 100 / maximumCapacity;
  return { maximumCapacity, currentUsage, utilizationPercentage, idlePercentage: Math.max(0, 100 - utilizationPercentage), dataStatus: "AVAILABLE" as const };
};

const comparison = (current: number, previous: number | null): AdministrationMetricComparison => {
  const absoluteChange = previous === null ? null : current - previous;
  const percentageChange = previous === null ? null : previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100;
  const direction: AdministrationTrendDirection = absoluteChange === null ? "none" : absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "stable";
  return { current, previous, absoluteChange, percentageChange, direction, comparable: previous !== null && percentageChange !== null, reason: percentageChange === null ? "previous_zero_or_unavailable" : undefined };
};

export const getAdministrationSummary = async (clubId: string): Promise<AdministrationSummaryResponse> => {
  const months = getLastCompleteMonthWindows();
  const [rows, sectorCapacityRows] = await Promise.all([getAdministrationSummaryRows(clubId, months.previousStart, months.currentStart, months.currentEnd),getAdministrationSectorCapacities(clubId)]);
  const previousGrowth = rows.growth[0];
  const currentGrowth = rows.growth[1];
  const totalCapacity = toNumber(rows.capacity.total_capacity);
  const occupied = toNumber(rows.capacity.occupied);
  const available = Math.max(totalCapacity - occupied, 0);
  const occupancyRate = totalCapacity > 0 ? (occupied / totalCapacity) * 100 : 0;
  const sectorUtilizations = sectorCapacityRows.flatMap(row => row.data_status === "AVAILABLE" && row.utilization_percentage != null ? [Number(row.utilization_percentage)] : []);
  const sectorUtilizationAverage = sectorUtilizations.length ? sectorUtilizations.reduce((sum,value)=>sum+value,0)/sectorUtilizations.length : null;

  return {
    cards: [
      { id: "active-enrollments", label: "Inscripciones activas", value: rows.enrollments.active, tone: "info" },
      { id: "up-to-date-enrollments", label: "Al día", value: rows.enrollments.up_to_date, tone: "positive" },
      { id: "new-enrollments", label: "Nuevas", value: rows.enrollments.new_enrollments, tone: "neutral" },
      { id: "owing-enrollments", label: "Adeudando", value: rows.enrollments.owing, tone: "warning" },
      { id: "abandoned-enrollments", label: "Abandonadas", value: rows.enrollments.abandoned, tone: "negative" },
      { id: "workers", label: "Trabajadores", value: rows.entities.workers, tone: "neutral" },
      { id: "users", label: "Usuarios", value: rows.entities.users, tone: "neutral" },
      { id: "roles", label: "Roles", value: rows.entities.roles, tone: "neutral" },
      { id: "active-activities", label: "Actividades activas", value: rows.entities.active_activities, tone: "neutral" },
    ],
    balance: { cutoffDate: null, valuationStatus: "INCOMPLETE_EXCHANGE_RATE", unvaluedAccountCount: 0, missingPairs: [], valuationMode: "LIVE_RECALCULATED", liquidity: metric(0), cash: metric(0), bank: metric(0), dollars: metric(0) },
    pending: { income: metric(0), expenses: metric(0), balance: metric(0), movements: metric(0) },
    totals: {
      sectors: metric(0),
      activities: metric(rows.entities.active_activities),
      workers: metric(rows.entities.workers),
      tasks: metric(0),
      requests: metric(0),
      movements: metric(toNumber(currentGrowth?.movements), comparison(toNumber(currentGrowth?.movements), toNumber(previousGrowth?.movements))),
      enrollments: metric(rows.enrollments.active, comparison(toNumber(currentGrowth?.enrollments), toNumber(previousGrowth?.enrollments))),
    },
    capacity: { totalCapacity, occupied, available, occupancyRate, sectorUtilizationAverage, sectorsWithData:sectorUtilizations.length,sectorsWithoutData:sectorCapacityRows.length-sectorUtilizations.length, sectors: sectorCapacityRows.map(row=>({id:row.sector_id,name:row.name,capacity:row.maximum_capacity==null?null:Number(row.maximum_capacity),occupied:Number(row.current_usage??0),available:null,occupancyRate:row.utilization_percentage==null?null:Number(row.utilization_percentage),capacityMode:row.capacity_mode,currentUsage:row.current_usage==null?null:Number(row.current_usage),utilizationPercentage:row.utilization_percentage==null?null:Number(row.utilization_percentage),idlePercentage:row.idle_percentage==null?null:Number(row.idle_percentage),dataStatus:row.data_status})), activities: [] },
    rankings: {
      sectorsByBalance: [],
      sectorsByMovements: [],
      activitiesByEnrollments: rows.topActivities.map((activity, index) => ({ id: activity.id, label: activity.label, value: activity.enrollments, rank: index + 1 })),
      workersByTasks: [],
    },
    trends: {
      granularity: "month",
      points: rows.growth.map((row) => ({ period: row.period, granularity: "month", income: toNumber(row.income), expenses: toNumber(row.expenses), balance: toNumber(row.balance), movements: row.movements, enrollments: row.enrollments })),
    },
    recentMovements: [],
    generatedAt: new Date().toISOString(),
    metadata: { source: "postgres", warnings: [] },
  };
};
