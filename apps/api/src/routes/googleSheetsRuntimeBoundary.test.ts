import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const productionSourceRoots = ["routes", "services"] as const;
const forbiddenModules = ["importers/googleSheets", "legacy/googleSheets"] as const;

const walkProductionTypescript = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkProductionTypescript(absolutePath);
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [absolutePath];
  }));
  return files.flat();
};

test("production routes and services cannot import Google Sheets modules", async () => {
  const sourceRoot = path.resolve(import.meta.dirname, "..");
  const files = (await Promise.all(
    productionSourceRoots.map((root) => walkProductionTypescript(path.join(sourceRoot, root))),
  )).flat();

  const violations: string[] = [];
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    for (const forbiddenModule of forbiddenModules) {
      if (source.includes(forbiddenModule)) {
        violations.push(`${path.relative(sourceRoot, file)} -> ${forbiddenModule}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Google Sheets debe permanecer aislado del runtime productivo:\n${violations.join("\n")}`,
  );
});
