import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EconomySummaryCards } from './EconomySummaryCards';
import { EconomyMonthlySummaryPanel } from './EconomyMonthlySummaryPanel';
import { formatEconomyMoney } from './formatters';
import type { EconomyComparison, EconomySummary } from './types';

test('Tesorería conserva diez indicadores y distingue saldo incompleto de cero', () => {
  const summary: EconomySummary = {
    month: { label: 'Septiembre', income: null, expenses: 0, balance: null },
    income: null, expenses: 0, balance: null, liquidity: 1200, projectedBalance: null,
    pendingBalance: 0, currencyCode: 'USD', period: '2026-09',
    valuationStatus: 'INCOMPLETE_EXCHANGE_RATE', missingRateCount: 1,
    projectionComplete: false, projectionAssumptions: [], completedMovements: 2, totalMovements: 2,
  };
  const comparison: EconomyComparison = { currentPeriod: 'Agosto 2026', previousPeriod: 'Julio 2026', items: [], total: 0 };
  const html = renderToStaticMarkup(createElement(EconomySummaryCards, { summary, comparison }));
  assert.equal((html.match(/economy-top-card--(?:positive|negative|utility|projected)/g) ?? []).length, 10);
  assert.match(html, /Liquidez actual/);
  assert.match(html, /Saldo proyectado/);
  assert.match(html, /Sin cotización/);
  assert.match(html, /US\$/);
  assert.notEqual(formatEconomyMoney(0, 'USD'), formatEconomyMoney(null, 'USD'));
});

test('resumen histórico muestra su año y no suma como cero un mes sin cotización', () => {
  const html = renderToStaticMarkup(createElement(EconomyMonthlySummaryPanel, {
    year: 2025, currencyCode: 'ARS', monthlyEvolution: { total: 1, items: [{
      year: 2025, month: 3, period: '2025-03', income: null, expenses: 20, balance: null,
      movements: 1, incomeVariation: null, expensesVariation: null, balanceVariation: null,
    }] },
  }));
  assert.match(html, /2025/);
  assert.match(html, /Sin cotización/);
  assert.equal((html.match(/economy-monthly-box--/g) ?? []).length, 3);
});
