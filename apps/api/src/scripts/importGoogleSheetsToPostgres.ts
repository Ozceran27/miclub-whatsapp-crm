import "dotenv/config";
import { closePostgresPool } from "../db/postgres.js";
import { importGoogleSheets } from "../importers/googleSheetsImporter.js";

const hasFlag = (name: string): boolean => process.argv.includes(name);
const readNumberFlag = (name: string, fallback: number): number => {
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  const value = prefixed ? prefixed.split("=")[1] : process.argv[process.argv.indexOf(name) + 1];
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const main = async (): Promise<void> => {
  const dryRun = hasFlag("--dry-run") || hasFlag("--dry");
  const batchSize = readNumberFlag("--batch-size", 50);
  const summary = await importGoogleSheets({ dryRun, batchSize });
  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
