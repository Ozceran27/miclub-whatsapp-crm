import type { AdministrationMetricComparison, AdministrationSummaryResponse, AdministrationTrendDirection } from "@miclub/shared";
import { getAdministrationSummaryRows } from "../../repositories/administration/administrationSummaryRepository.js";
import { getLastCompleteMonthWindows } from "../economyDomain.js";

const toNumber = (value: string | number | null | undefined): number => Number(value ?? 0);

const metric = (value: number, comparison: AdministrationMetricComparison | null = null) => ({ value, comparison });

const comparison = (current: number, previous: number | null): AdministrationMetricComparison => {
  const absoluteChange = previous === null ? null : current - previous;
  const percentageChange = previous === null ? null : previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100;
  const direction: AdministrationTrendDirection = absoluteChange === null ? "none" : absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "stable";
  return { current, previous, absoluteChange, percentageChange, direction, comparable: previous !== null && percentageChange !== null, reason: percentageChange === null ? "previous_zero_or_unavailable" : undefined };
};

export const getAdministrationSummary = async (clubId: string): Promise<AdministrationSummaryResponse> => {
  const months = getLastCompleteMonthWindows();
  const rows = await getAdministrationSummaryRows(clubId, months.previousStart, months.currentStart, months.currentEnd);
  const previousGrowth = rows.growth[0];
  const currentGrowth = rows.growth[1];
  const totalCapacity = toNumber(rows.capacity.total_capacity);
  const occupied = toNumber(rows.capacity.occupied);
  const available = Math.max(totalCapacity - occupied, 0);
  const occupancyRate = totalCapacity > 0 ? (occupied / totalCapacity) * 100 : 0;

  return {
    cards: [
      { id: "active-enrollments", label: "Inscripciones activas", value: rows.enrollments.active, tone: "info" },
      { id: "up-to-date-enrollments", label: "Al día", value: rows.enrollments.up_to_date, tone: "positive" },
      { id: "new-enrollments", label: "Nuevas", value: rows.enrollments.new_enrollments, tone: "neutral" },
      { id: "owing-enrollments", label: "Adeudando", value: rows.enrollments.owing, tone: "warning" },
      { id: "abandoned-enrollments", label: "Abandonadas", value: rows.enrollments.abandoned, tone: "negative" },
      { id: "operational-capacity", label: "Capacidad operativa", value: occupancyRate, formattedValue: `${occupancyRate.toFixed(1)}%`, helperText: `${occupied}/${totalCapacity}`, tone: "info" },
      { id: "workers", label: "Trabajadores", value: rows.entities.workers, tone: "neutral" },
      { id: "users", label: "Usuarios", value: rows.entities.users, tone: "neutral" },
      { id: "roles", label: "Roles", value: rows.entities.roles, tone: "neutral" },
      { id: "active-activities", label: "Actividades activas", value: rows.entities.active_activities, tone: "neutral" },
    ],
    balance: { cutoffDate: null, liquidity: metric(0), cash: metric(0), bank: metric(0), dollars: metric(0) },
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
    capacity: { totalCapacity, occupied, available, occupancyRate, sectors: [], activities: [] },
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
