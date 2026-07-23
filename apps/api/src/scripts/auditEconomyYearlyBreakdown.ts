import "dotenv/config";
import { closePostgresPool } from "../db/postgres.js";
import { getYearlyBreakdownRows } from "../repositories/economyRepository.js";
import { buildYearlyBreakdown } from "../services/economyService.js";
import { getArgentinaYearWindow } from "../services/economyDomain.js";

const yearArg = process.argv.find((arg) => /^--year=\d{4}$/.test(arg));
const year = yearArg ? Number(yearArg.split("=")[1]) : new Date().getUTCFullYear();
const window = getArgentinaYearWindow(year);

getYearlyBreakdownRows(window.start, window.end)
  .then((rows) => {
    const breakdown = buildYearlyBreakdown(year, rows) as any;
    console.log(JSON.stringify({
      year,
      period: { from: window.start.toISOString(), to: window.end.toISOString() },
      operatingIncomeByCategory: breakdown.operatingIncomeByCategory,
      expensesByType: breakdown.expensesByType,
      unclassifiedExpenses: breakdown.metadata.unclassifiedExpenseCategories ?? [],
      consideredMovements: breakdown.metadata.consideredMovements,
      signConvention: breakdown.metadata.signConvention,
    }, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
