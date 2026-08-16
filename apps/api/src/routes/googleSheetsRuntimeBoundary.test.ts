import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const retiredPaths = [
  "importers/googleSheets",
  "importers/googleSheetsImporter.ts",
  "legacy/googleSheets",
  "scripts/importGoogleSheetsToPostgres.ts",
] as const;

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }))).flat();
};

test("Google Sheets was definitively retired from API source and production entry points", async () => {
  const sourceRoot = path.resolve(import.meta.dirname, "..");
  const repositoryRoot = path.resolve(sourceRoot, "../../..");

  const pathsStillPresent: string[] = [];
  for (const retiredPath of retiredPaths) {
    try {
      await access(path.join(sourceRoot, retiredPath));
      pathsStillPresent.push(retiredPath);
    } catch {
      // Absence is the retirement invariant asserted by this test.
    }
  }
  assert.deepEqual(pathsStillPresent, [], `Retired Google Sheets paths returned:\n${pathsStillPresent.join("\n")}`);

  const importViolations: string[] = [];
  for (const file of await walk(sourceRoot)) {
    if (!/\.tsx?$/.test(file) || file === import.meta.filename) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
      if (/googleSheets|googleapis/i.test(match[1])) {
        importViolations.push(`${path.relative(sourceRoot, file)} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual(importViolations, [], `Google Sheets remains reachable from API source:\n${importViolations.join("\n")}`);

  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const apiPackage = JSON.parse(await readFile(path.join(repositoryRoot, "apps/api/package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(rootPackage.scripts?.["import:sheets"], undefined);
  assert.equal(rootPackage.scripts?.["import:sheets:dry"], undefined);
  assert.equal(apiPackage.dependencies?.googleapis, undefined);
});
