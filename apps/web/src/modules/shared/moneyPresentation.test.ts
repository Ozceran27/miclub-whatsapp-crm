import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoney } from '../../utils';
import { isQuoteStale } from './MoneyPresentation';

test('formats zero as a known amount and missing values as unknown', () => {
  assert.match(formatMoney(0, 'ARS'), /0/);
  assert.equal(formatMoney(null, 'ARS'), '—');
  assert.match(formatMoney(12.5, 'USD'), /12\.50/);
});

test('identifies missing, expired and current quotes', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');
  assert.equal(isQuoteStale(null, now), true);
  assert.equal(isQuoteStale('2026-08-30T12:00:00Z', now), true);
  assert.equal(isQuoteStale('2026-09-01T08:00:00Z', now), false);
});
