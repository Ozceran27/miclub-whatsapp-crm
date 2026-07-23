import "dotenv/config";
import { closePostgresPool } from "../db/postgres.js";
import { getYearlyBreakdownRows } from "../repositories/economyRepository.js";
import { buildYearlyBreakdown } from "../services/economyService.js";
import { getRollingInterannualMonthWindow } from "../services/economyDomain.js";

const asOfArg = process.argv.find((arg) => /^--asOf=\d{4}-\d{2}-\d{2}$/.test(arg));
const asOf = asOfArg ? new Date(`${asOfArg.split("=")[1]}T12:00:00-03:00`) : new Date();
const window = getRollingInterannualMonthWindow(asOf);

getYearlyBreakdownRows(window.start, window.end)
  .then((rows) => {
    const breakdown = buildYearlyBreakdown(window, rows) as any;
    console.log(JSON.stringify({
      period: breakdown.period,
      months: breakdown.months,
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
