import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../db/migrations/202608280003_compensation_and_activity_term_currencies.sql", import.meta.url), "utf8");

test("backfill is tenant-scoped and prefers the club's active opening-balance currency", () => {
  assert.match(sql, /b\.club_id=c\.id AND b\.status='APPLIED'/);
  assert.match(sql, /WHERE e\.club_id=c\.id AND e\.has_fixed_compensation/);
  assert.match(sql, /WHERE t\.club_id=c\.id AND t\.mode='FIXED'/);
  assert.match(sql, /coalesce\(ob\.operational_currency_code, c\.base_currency_code\)/);
});

test("currency FKs and fixed-versus-variable nullability are enforced", () => {
  assert.equal((sql.match(/REFERENCES miclub\.currencies\(code\)/g) ?? []).length, 2);
  assert.match(sql, /mode='FIXED' AND currency_code IS NOT NULL/);
  assert.match(sql, /mode='VARIABLE' AND currency_code IS NULL/);
});

test("historical activity terms retain currency per version", () => {
  assert.match(sql, /Moneda histórica de fixed_club_fee/);
  assert.doesNotMatch(sql, /UPDATE miclub\.activity_terms[\s\S]*SET effective_/);
});
