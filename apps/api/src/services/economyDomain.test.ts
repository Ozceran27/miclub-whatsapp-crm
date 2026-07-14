import assert from "node:assert/strict";
import test from "node:test";
import { calculateVariation, getCurrentMonthWindow, getRolling30DayWindows, isOperatingCategory } from "./economyDomain.js";

test("current month window uses Argentina timezone and month label", () => {
  const window = getCurrentMonthWindow(new Date("2026-07-14T12:00:00Z"));
  assert.equal(window.label, "Julio");
  assert.equal(window.start.toISOString(), "2026-07-01T03:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-01T03:00:00.000Z");
});

test("rolling windows cover two consecutive 30 day windows without overlap", () => {
  const windows = getRolling30DayWindows(new Date("2026-07-14T12:00:00Z"));
  assert.equal(windows.currentStart.toISOString(), "2026-06-15T03:00:00.000Z");
  assert.equal(windows.tomorrowStart.toISOString(), "2026-07-15T03:00:00.000Z");
  assert.equal(windows.previousStart.toISOString(), "2026-05-16T03:00:00.000Z");
  assert.equal((windows.tomorrowStart.getTime() - windows.currentStart.getTime()) / 86_400_000, 30);
  assert.equal((windows.currentStart.getTime() - windows.previousStart.getTime()) / 86_400_000, 30);
});

test("variation handles zero base and negative crossings without infinity", () => {
  assert.deepEqual(calculateVariation(0, 0), { current: 0, previous: 0, absoluteChange: 0, percentageChange: 0, direction: "stable", comparable: true, impact: "neutral" });
  assert.equal(calculateVariation(100, 0).percentageChange, null);
  assert.equal(calculateVariation(100, 0).comparable, false);
  assert.equal(Number.isFinite(calculateVariation(100, -50).percentageChange ?? 0), true);
  assert.equal(calculateVariation(-50, 100).direction, "down");
});

test("operating categories are normalized exactly", () => {
  assert.equal(isOperatingCategory(" inscripción "), true);
  assert.equal(isOperatingCategory("COMISIÓN"), true);
  assert.equal(isOperatingCategory("cuota extra"), false);
  assert.equal(isOperatingCategory("CAPITAL"), false);
});
