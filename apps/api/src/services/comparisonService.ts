import type { ClubOperationsSummary, Member, SourceSheet } from "@miclub/shared";
import { getDashboardBasic, getSectorFinanceSummary } from "./dashboardService.js";
import { getClubOperationsSummaryFromGoogleSheets, getGoogleSheetsConfig, getMembersFromGoogleSheets, normalizeOperationalStatus } from "./googleSheets.js";
import { getPostgresClubFinanceSummary, getPostgresMembers, getPostgresSummary } from "./postgresDashboardService.js";
import { normalizeRow, type JsonRecord } from "./rowNormalizer.js";

const SECTORS: SourceSheet[] = ["FITNESS", "SALON", "AULA", "LOCAL_1", "CANTINA", "ADMINISTRACION"];

type NumericMap = Record<string, number>;

type AggregateSnapshot = {
  totalMembers: number;
  totalDebtors: number;
  totalEstimatedDebt: number;
  activeMembers: number;
  abandonedMembers: number;
  incomeBySector: NumericMap;
  expenseBySector: NumericMap;
  balanceBySector: NumericMap;
};

type DifferenceEntry = {
  legacy: number;
  postgres: number;
  delta: number;
  percentDelta: number | null;
};

type ComparisonResult = {
  generatedAt: string;
  sources: { legacy: string; postgres: string };
  totals: Record<string, DifferenceEntry>;
  bySector: Record<string, Record<string, DifferenceEntry>>;
  warnings: string[];
};

const roundMoney = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const normalizeSectorKey = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, "_");

const emptySectorMap = (): NumericMap => Object.fromEntries(SECTORS.map((sector) => [sector, 0]));

const addToMap = (map: NumericMap, key: string, amount: number) => {
  const normalizedKey = normalizeSectorKey(key || "SIN_SECTOR");
  map[normalizedKey] = roundMoney((map[normalizedKey] ?? 0) + amount);
};

const diff = (legacy: number, postgres: number): DifferenceEntry => {
  const delta = roundMoney(postgres - legacy);
  return {
    legacy: roundMoney(legacy),
    postgres: roundMoney(postgres),
    delta,
    percentDelta: legacy === 0 ? null : roundMoney((delta / legacy) * 100)
  };
};

const buildStatusCounts = (members: Member[]) => {
  const counts = { debtors: 0, active: 0, abandoned: 0 };
  for (const member of members) {
    const status = normalizeOperationalStatus(member.estado);
    if (status === "adeudando") counts.debtors += 1;
    if (status === "abandonado") counts.abandoned += 1;
    else counts.active += 1;
  }
  return counts;
};

const buildMemberAggregate = (members: Member[], finance?: ClubOperationsSummary): AggregateSnapshot => {
  const statusCounts = buildStatusCounts(members);
  const debtors = members.filter((member) => normalizeOperationalStatus(member.estado) === "adeudando");
  const balanceBySector = emptySectorMap();
  for (const balance of finance?.sectorBalances ?? []) addToMap(balanceBySector, balance.sector, balance.amount);

  return {
    totalMembers: members.length,
    totalDebtors: statusCounts.debtors,
    totalEstimatedDebt: debtors.reduce((sum, member) => sum + (member.cuota ?? 0), 0),
    activeMembers: statusCounts.active,
    abandonedMembers: statusCounts.abandoned,
    incomeBySector: Object.fromEntries((finance?.incomeBySector ?? []).map((entry) => [normalizeSectorKey(entry.name), roundMoney(entry.amount)])),
    expenseBySector: Object.fromEntries((finance?.expenseBySector ?? []).map((entry) => [normalizeSectorKey(entry.name), roundMoney(entry.amount)])),
    balanceBySector
  };
};

const pickNumber = (row: JsonRecord | null | undefined, keys: string[]): number => {
  if (!row) return 0;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const buildDashboardAggregate = async (): Promise<AggregateSnapshot> => {
  const [summary, finance, dashboard, sectors] = await Promise.all([
    getPostgresSummary(),
    getPostgresClubFinanceSummary(),
    getDashboardBasic(),
    getSectorFinanceSummary()
  ]);
  const incomeBySector: NumericMap = {};
  const expenseBySector: NumericMap = {};
  const balanceBySector: NumericMap = emptySectorMap();

  for (const sector of sectors.items) {
    const row = normalizeRow(sector);
    const sectorName = String(row.sectorName ?? row.sector ?? "SIN_SECTOR");
    addToMap(incomeBySector, sectorName, pickNumber(row, ["income", "totalIncome", "totalRevenue", "ingresos"]));
    addToMap(expenseBySector, sectorName, pickNumber(row, ["expense", "totalExpense", "egresos"]));
    addToMap(balanceBySector, sectorName, pickNumber(row, ["settlementBalance", "balance", "amount", "saldo"]));
  }

  return {
    totalMembers: summary.totalMembers,
    totalDebtors: summary.totalDebtors,
    totalEstimatedDebt: summary.totalEstimatedDebt,
    activeMembers: summary.statusBreakdown.active,
    abandonedMembers: summary.statusBreakdown.abandonado,
    incomeBySector: Object.keys(incomeBySector).length ? incomeBySector : Object.fromEntries(finance.incomeBySector.map((entry) => [normalizeSectorKey(entry.name), roundMoney(entry.amount)])),
    expenseBySector: Object.keys(expenseBySector).length ? expenseBySector : Object.fromEntries(finance.expenseBySector.map((entry) => [normalizeSectorKey(entry.name), roundMoney(entry.amount)])),
    balanceBySector,
  };
};

const compareAggregates = (legacy: AggregateSnapshot, postgres: AggregateSnapshot, sources: ComparisonResult["sources"], warnings: string[] = []): ComparisonResult => {
  const allSectors = Array.from(new Set([...Object.keys(legacy.incomeBySector), ...Object.keys(postgres.incomeBySector), ...Object.keys(legacy.expenseBySector), ...Object.keys(postgres.expenseBySector), ...Object.keys(legacy.balanceBySector), ...Object.keys(postgres.balanceBySector)])).sort();
  return {
    generatedAt: new Date().toISOString(),
    sources,
    totals: {
      totalMembers: diff(legacy.totalMembers, postgres.totalMembers),
      totalDebtors: diff(legacy.totalDebtors, postgres.totalDebtors),
      totalEstimatedDebt: diff(legacy.totalEstimatedDebt, postgres.totalEstimatedDebt),
      activeMembers: diff(legacy.activeMembers, postgres.activeMembers),
      abandonedMembers: diff(legacy.abandonedMembers, postgres.abandonedMembers)
    },
    bySector: Object.fromEntries(allSectors.map((sector) => [sector, {
      income: diff(legacy.incomeBySector[sector] ?? 0, postgres.incomeBySector[sector] ?? 0),
      expense: diff(legacy.expenseBySector[sector] ?? 0, postgres.expenseBySector[sector] ?? 0),
      balance: diff(legacy.balanceBySector[sector] ?? 0, postgres.balanceBySector[sector] ?? 0)
    }])),
    warnings
  };
};

export const compareLegacySummaryWithPostgresDashboard = async (): Promise<ComparisonResult> => {
  const legacyMembers = await getMembersFromGoogleSheets();
  const legacyFinance = await getClubOperationsSummaryFromGoogleSheets(legacyMembers);
  return compareAggregates(
    buildMemberAggregate(legacyMembers, legacyFinance),
    await buildDashboardAggregate(),
    { legacy: "google_sheets_summary", postgres: "postgres_dashboard" },
    getGoogleSheetsConfig().enabled ? [] : ["Google Sheets está desactivado; la comparación legacy puede no representar producción."]
  );
};

export const compareLegacyMembersWithPostgresEnrollments = async (): Promise<ComparisonResult> => {
  const [legacyMembers, postgresMembers, postgresFinance] = await Promise.all([
    getMembersFromGoogleSheets(),
    getPostgresMembers(),
    getPostgresClubFinanceSummary()
  ]);
  const legacyFinance = await getClubOperationsSummaryFromGoogleSheets(legacyMembers);
  return compareAggregates(
    buildMemberAggregate(legacyMembers, legacyFinance),
    buildMemberAggregate(postgresMembers, postgresFinance),
    { legacy: "google_sheets_members", postgres: "postgres_enrollments_personas" }
  );
};

export const compareLegacyWithPostgres = async () => ({
  summaryVsDashboard: await compareLegacySummaryWithPostgresDashboard(),
  membersVsEnrollments: await compareLegacyMembersWithPostgresEnrollments()
});
