import type { ClubOperationsSummary, Member, SectorOperationalSummary } from "@miclub/shared";
import {
  getClubFinanceDebugFromGoogleSheets,
  getClubOperationsSummaryFromGoogleSheets,
  getSectorOperationalDebug,
  getSectorOperationalSummary,
  type ClubFinanceDebugInfo,
  type SectorOperationalDebugInfo,
} from "./googleSheets.js";
import {
  getPostgresClubFinanceSummary,
  getPostgresMembers,
  getPostgresSectorOperationalSummary,
} from "./postgresDashboardService.js";

export type ReconciliationStatus = "match" | "difference" | "missing_google_sheets" | "missing_postgres";

export interface DashboardReconciliationMetric {
  metricKey: string;
  googleSheetsValue: number | null;
  postgresValue: number | null;
  delta: number | null;
  status: ReconciliationStatus;
}

export interface DashboardReconciliationResult {
  generatedAt: string;
  tolerance: number;
  metrics: DashboardReconciliationMetric[];
  summary: Record<ReconciliationStatus, number>;
  sources: {
    googleSheets: "debug";
    postgres: "summary";
  };
}

type ReconciliationInput = {
  googleFinanceDebug: Pick<ClubFinanceDebugInfo, "liquidity" | "parsedCash" | "parsedBank" | "parsedDollars" | "cuotasACobrar" | "saldosAPagar" | "projectedBalance">;
  googleFinanceSummary: Pick<ClubOperationsSummary, "incomeBySector" | "expenseBySector">;
  googleSectorDebug: Pick<SectorOperationalDebugInfo, "parsedBalances" | "cantina">;
  googleSectorSummary: SectorOperationalSummary;
  postgresFinanceSummary: ClubOperationsSummary;
  postgresSectorSummary: SectorOperationalSummary;
};

const normalizeSectorKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");

const amountForSector = (items: Array<{ name: string; amount: number }>, sector: string): number | null => {
  const normalizedSector = normalizeSectorKey(sector);
  const item = items.find((entry) => normalizeSectorKey(entry.name) === normalizedSector);
  return item ? item.amount : null;
};

const roundDelta = (value: number): number => Math.round(value * 100) / 100;

const compareMetric = (
  metricKey: string,
  googleSheetsValue: number | null | undefined,
  postgresValue: number | null | undefined,
  tolerance: number,
): DashboardReconciliationMetric => {
  const googleValue = googleSheetsValue ?? null;
  const postgresMetricValue = postgresValue ?? null;
  const delta = googleValue === null || postgresMetricValue === null ? null : roundDelta(postgresMetricValue - googleValue);
  let status: ReconciliationStatus = "match";
  if (googleValue === null) status = "missing_google_sheets";
  else if (postgresMetricValue === null) status = "missing_postgres";
  else if (Math.abs(delta ?? 0) > tolerance) status = "difference";
  return { metricKey, googleSheetsValue: googleValue, postgresValue: postgresMetricValue, delta, status };
};

const summarize = (metrics: DashboardReconciliationMetric[]) =>
  metrics.reduce<Record<ReconciliationStatus, number>>(
    (acc, metric) => ({ ...acc, [metric.status]: acc[metric.status] + 1 }),
    { match: 0, difference: 0, missing_google_sheets: 0, missing_postgres: 0 },
  );

export const buildDashboardReconciliation = (input: ReconciliationInput, tolerance = 0): DashboardReconciliationResult => {
  const pairs: Array<[string, number | null | undefined, number | null | undefined]> = [
    ["club.liquidity", input.googleFinanceDebug.liquidity, input.postgresFinanceSummary.liquidity],
    ["club.cash", input.googleFinanceDebug.parsedCash, input.postgresFinanceSummary.cash],
    ["club.bank", input.googleFinanceDebug.parsedBank, input.postgresFinanceSummary.bank],
    ["club.dollars", input.googleFinanceDebug.parsedDollars, input.postgresFinanceSummary.dollars],
    ["club.cuotas_a_cobrar", input.googleFinanceDebug.cuotasACobrar, input.postgresFinanceSummary.cuotasACobrar],
    ["club.saldos_a_pagar", input.googleFinanceDebug.saldosAPagar, input.postgresFinanceSummary.saldosAPagar],
    ["club.projected_balance", input.googleFinanceDebug.projectedBalance, input.postgresFinanceSummary.projectedBalance],
    ["fitness.total_profitability", input.googleSectorDebug.parsedBalances.fitness, input.postgresSectorSummary.fitness.totalProfitability],
    ["local1.total_profitability", input.googleSectorDebug.parsedBalances.local1, input.postgresSectorSummary.local1.totalProfitability],
    ["fitness.settlement_balance", input.googleSectorDebug.parsedBalances.fitnessSettlement, input.postgresSectorSummary.fitness.settlementBalance],
    ["local1.settlement_balance", input.googleSectorDebug.parsedBalances.local1Settlement, input.postgresSectorSummary.local1.settlementBalance],
    ["cantina.total_profitability", input.googleSectorDebug.cantina?.totalProfitability, input.postgresSectorSummary.cantina.totalProfitability],
    ["cantina.kiosk_income", input.googleSectorDebug.cantina?.kioskIncome, input.postgresSectorSummary.cantina.kioskIncome],
    ["cantina.drinks_income", input.googleSectorDebug.cantina?.drinksIncome, input.postgresSectorSummary.cantina.drinksIncome],
    ["cantina.cmv", input.googleSectorDebug.cantina?.cmv, input.postgresSectorSummary.cantina.cmv],
  ];

  const sectors = Array.from(
    new Set([
      ...input.googleFinanceSummary.incomeBySector.map((item) => item.name),
      ...input.googleFinanceSummary.expenseBySector.map((item) => item.name),
      ...input.postgresFinanceSummary.incomeBySector.map((item) => item.name),
      ...input.postgresFinanceSummary.expenseBySector.map((item) => item.name),
    ]),
  ).sort((a, b) => a.localeCompare(b, "es"));

  for (const sector of sectors) {
    const key = normalizeSectorKey(sector) || "sin_sector";
    pairs.push([
      `sector.${key}.income`,
      amountForSector(input.googleFinanceSummary.incomeBySector, sector),
      amountForSector(input.postgresFinanceSummary.incomeBySector, sector),
    ]);
    pairs.push([
      `sector.${key}.expense`,
      amountForSector(input.googleFinanceSummary.expenseBySector, sector),
      amountForSector(input.postgresFinanceSummary.expenseBySector, sector),
    ]);
  }

  const metrics = pairs.map(([metricKey, googleValue, postgresValue]) => compareMetric(metricKey, googleValue, postgresValue, tolerance));
  return {
    generatedAt: new Date().toISOString(),
    tolerance,
    metrics,
    summary: summarize(metrics),
    sources: { googleSheets: "debug", postgres: "summary" },
  };
};

export const getDashboardReconciliation = async (members?: Member[]): Promise<DashboardReconciliationResult> => {
  const reconciliationMembers = members ?? (await getPostgresMembers());
  const [googleFinanceDebug, googleFinanceSummary, googleSectorDebug, googleSectorSummary, postgresFinanceSummary, postgresSectorSummary] = await Promise.all([
    getClubFinanceDebugFromGoogleSheets(reconciliationMembers),
    getClubOperationsSummaryFromGoogleSheets(reconciliationMembers),
    getSectorOperationalDebug(reconciliationMembers),
    getSectorOperationalSummary(reconciliationMembers),
    getPostgresClubFinanceSummary(),
    getPostgresSectorOperationalSummary(),
  ]);

  return buildDashboardReconciliation({
    googleFinanceDebug,
    googleFinanceSummary,
    googleSectorDebug,
    googleSectorSummary,
    postgresFinanceSummary,
    postgresSectorSummary,
  });
};
