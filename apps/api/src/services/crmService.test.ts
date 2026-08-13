import test from "node:test";
import assert from "node:assert/strict";
import { resolveCrmSource } from "./crmService.js";

test("CRM usa PostgreSQL cuando CRM_SOURCE está ausente o es inválido", () => {
  assert.equal(resolveCrmSource(undefined), "postgres");
  assert.equal(resolveCrmSource("postgress"), "postgres");
});

test("SQLite tampoco puede seleccionarse como fallback productivo", () => {
  assert.equal(resolveCrmSource("sqlite"), "postgres");
});
