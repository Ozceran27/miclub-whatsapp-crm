import assert from "node:assert/strict";
import test from "node:test";
import {
  formatArgentinaDate,
  getArgentinaDayWindow,
  getArgentinaLastNDaysWindow,
  getArgentinaMonthWindow,
  getArgentinaYearWindow,
} from "./argentinaTime.js";

test("month bounds use Argentina midnight across month and year changes", () => {
  const december = getArgentinaMonthWindow(new Date("2026-12-31T23:30:00-03:00"));
  assert.equal(december.from.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(december.to.toISOString(), "2027-01-01T03:00:00.000Z");

  const january = getArgentinaMonthWindow(new Date("2027-01-01T02:30:00.000Z"));
  assert.equal(january.from.toISOString(), "2026-12-01T03:00:00.000Z");
});

test("day bounds assign instants near UTC midnight to the Argentina civil date", () => {
  const beforeArgentinaMidnight = getArgentinaDayWindow(new Date("2026-08-01T02:59:59.999Z"));
  assert.equal(formatArgentinaDate(beforeArgentinaMidnight.from), "2026-07-31");
  assert.equal(beforeArgentinaMidnight.from.toISOString(), "2026-07-31T03:00:00.000Z");
  assert.equal(beforeArgentinaMidnight.to.toISOString(), "2026-08-01T03:00:00.000Z");

  const afterArgentinaMidnight = getArgentinaDayWindow(new Date("2026-08-01T03:00:00.000Z"));
  assert.equal(formatArgentinaDate(afterArgentinaMidnight.from), "2026-08-01");
});

test("year and last-N-day windows are half-open Argentina civil ranges", () => {
  const year = getArgentinaYearWindow(2026);
  assert.equal(year.from.toISOString(), "2026-01-01T03:00:00.000Z");
  assert.equal(year.to.toISOString(), "2027-01-01T03:00:00.000Z");

  const days = getArgentinaLastNDaysWindow(3, new Date("2027-01-01T02:30:00.000Z"));
  assert.equal(days.from.toISOString(), "2026-12-29T03:00:00.000Z");
  assert.equal(days.to.toISOString(), "2027-01-01T03:00:00.000Z");
});

test("last-N-day windows reject non-positive and fractional values", () => {
  assert.throws(() => getArgentinaLastNDaysWindow(0), RangeError);
  assert.throws(() => getArgentinaLastNDaysWindow(1.5), RangeError);
});
