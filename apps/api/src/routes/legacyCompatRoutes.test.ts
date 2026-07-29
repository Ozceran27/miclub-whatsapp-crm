import assert from "node:assert/strict";
import test from "node:test";
import { isDatabaseUnavailableError } from "./legacyCompatRoutes.js";

test("42703 es un error SQL interno y no una indisponibilidad de PostgreSQL", () => {
  assert.equal(isDatabaseUnavailableError(Object.assign(new Error("column club_id does not exist"), { code: "42703" })), false);
});

test("errores de conexión sí se clasifican como indisponibilidad", () => {
  assert.equal(isDatabaseUnavailableError(Object.assign(new Error("connection failure"), { code: "08006" })), true);
  assert.equal(isDatabaseUnavailableError(Object.assign(new Error("admin shutdown"), { code: "57P01" })), true);
});
