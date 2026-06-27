import "dotenv/config";
import { closePostgresPool } from "../db/postgres.js";
import { importGoogleSheets, parseMissingEnrollmentStrategy } from "../importers/googleSheetsImporter.js";

const hasFlag = (name: string): boolean => process.argv.includes(name);
const readStringFlag = (name: string): string | undefined => {
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.split("=")[1];
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const readNumberFlag = (name: string, fallback: number): number => {
  const value = readStringFlag(name);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const main = async (): Promise<void> => {
  const dryRun = hasFlag("--dry-run") || hasFlag("--dry");
  const batchSize = readNumberFlag("--batch-size", 50);
  const missingEnrollmentStrategy = parseMissingEnrollmentStrategy(readStringFlag("--missing-enrollment-strategy"));
  const summary = await importGoogleSheets({ dryRun, batchSize, missingEnrollmentStrategy });
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
