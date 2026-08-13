import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const allowedSource = /(?:^|\/)(legacy|importers\/googleSheets(?:Importer)?|scripts)(?:\/|$)|googleSheetsImporter\.ts$|\.test\.ts$/;
const prohibited = /(?:legacy\/(?:googleSheets|sqlite|mockData)|importers\/googleSheets|(?:^|\/)googleSheets(?:\/|\.js)|(?:^|\/)sqlite(?:\/|\.js)|(?:^|\/)mockData(?:\/|\.js))/;

const files = async (directory: string): Promise<string[]> => {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await files(target) : [target]));
  }
  return result;
};

void test("el runtime productivo no importa adaptadores Google Sheets, SQLite ni mockData", async () => {
  const violations: string[] = [];
  for (const file of await files(root)) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (!file.endsWith(".ts") || allowedSource.test(relative)) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
      if (prohibited.test(match[1])) violations.push(`${relative} -> ${match[1]}`);
    }
  }
  assert.deepEqual(violations, [], `Imports legacy fuera del límite permitido:\n${violations.join("\n")}`);
});
