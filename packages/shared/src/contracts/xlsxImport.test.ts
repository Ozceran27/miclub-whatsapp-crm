import assert from "node:assert/strict";
import test from "node:test";

import { detectMiclubXlsxImportVersion, XLSX_IMPORT_V1_SCHEMA } from "./xlsxImport.js";

const signature = Object.fromEntries(Object.values(XLSX_IMPORT_V1_SCHEMA.sheets).map((sheet) => [
  sheet.name,
  Object.fromEntries(sheet.columns.map((column) => [column.headerCell, column.header])),
]));

void test("detects v1 from the established workbook signature", () => {
  assert.equal(detectMiclubXlsxImportVersion(signature), "v2");
});

void test("rejects missing, moved and unknown headers", () => {
  assert.throws(() => detectMiclubXlsxImportVersion({}), /Formato XLSX desconocido/);
  assert.throws(() => detectMiclubXlsxImportVersion({ ...signature, INSCRIPCIONES: { ...signature.INSCRIPCIONES, M1: "Sector" } }), /Formato XLSX desconocido/);
});

void test("derives enrollment sector instead of requiring a redundant cell", () => {
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.derived.sector, "activity.sector");
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.derived.instructor, "activity.instructor");
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.columns.some((column) => column.key === "sector"), false);
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.columns.some((column) => column.key === "instructor" || column.key === "expiresOn"), false);
});

void test("documents every physical column and makes sheet order non-contractual", () => {
  assert.deepEqual(XLSX_IMPORT_V1_SCHEMA.sheets.movements.physicalColumns.map(({column}) => column), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  assert.deepEqual(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.physicalColumns.map(({column}) => column), "ABCDEFGHIJKLMNOPQRSTU".split(""));
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheetOrderContractual, false);
  assert.equal(XLSX_IMPORT_V1_SCHEMA.sheets.enrollments.physicalColumns.find(({column}) => column === "U")?.kind, "spacer");
});
