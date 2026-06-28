import test from 'node:test';
import assert from 'node:assert/strict';
import { processMovement } from './googleSheetsImporter.js';
import { resolveMovementColumnIndexes } from '../services/googleSheets.js';

const createSummary = () => ({
  batchId: 'batch-1',
  dryRun: false,
  read: 0,
  attemptedWrites: 0,
  persistedWrites: 0,
  rolledBackWrites: 0,
  sectorsProcessed: 0,
  movementCategoriesProcessed: 0,
  peopleProcessed: 0,
  instructorsProcessed: 0,
  activitiesProcessed: 0,
  enrollmentsProcessed: 0,
  movementsProcessed: 0,
  missingEnrollments: 0,
  missingEnrollmentsAction: 'warn' as const,
  errors: 0,
  warnings: [],
});

test('processMovement importa movimientos operativos con monto cero', async () => {
  const headers = ['ID', 'Fecha', '', 'Tipo', '', '', 'Categoria', '', '', 'Concepto', '', '', '', '', 'Contraparte', '', '', 'Sector', '', 'Monto', '', '', 'Impuestos', '', 'Estado Finan.', 'Estado', 'Medio Pago'];
  const row = ['BONIF-001', '20/06/2026', '', 'INGRESOS', '', '', 'CUOTA', '', '', 'Bonificación 100%', '', '', '', '', 'Alumno bonificado', '', '', 'FITNESS', '', '0', '', '', '0', '', 'PAGADO', 'COMPLETADO', 'Transferencia'];
  const resolved = resolveMovementColumnIndexes(headers);
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('from miclub.sectors')) return { rows: [{ id: 'sector-1' }] };
      if (sql.includes('from miclub.movement_categories')) return { rows: [{ id: 'category-1' }] };
      if (sql.includes('miclub.payment_methods')) return { rows: [{ id: 'payment-method-1' }] };
      if (sql.includes('miclub.movements')) return { rows: [{ id: 'movement-1' }] };
      return { rows: [] };
    },
  };
  const summary = createSummary();

  await processMovement(pool as never, { kind: 'movements', sheet: 'FITNESS', rowNumber: 42, row, movementIndexes: resolved.indexes, usedMovementFallback: false }, summary as never);

  const insert = queries.find((query) => query.sql.includes('insert into miclub.movements'));
  assert.ok(insert, 'expected a movement insert query');
  assert.equal(insert.params?.[2], 'INGRESOS');
  assert.equal(insert.params?.[5], 'Bonificación 100%');
  assert.equal(insert.params?.[7], 0);
  assert.equal(insert.params?.[10], 'pagado');
  assert.equal(insert.params?.[11], 'COMPLETADO');
  assert.equal(summary.movementsProcessed, 1);
});

test('processMovement omite filas de movimientos realmente vacías', async () => {
  const pool = { query: async () => { throw new Error('No debería consultar la base para filas vacías.'); } };
  const summary = createSummary();

  await processMovement(pool as never, { kind: 'movements', sheet: 'FITNESS', rowNumber: 43, row: [], movementIndexes: {}, usedMovementFallback: false }, summary as never);

  assert.equal(summary.movementsProcessed, 0);
  assert.equal(summary.attemptedWrites, 0);
});

test('processMovement importa movimientos de LOCAL 1 con layout sectorial sin columna Sector', async () => {
  const headers = ['Id.', 'Fecha', '', 'Tipo', '', 'Categoría', '', 'Concepto', '', '', '', '', 'Contra-parte', '', 'Monto', '', 'Impuestos', '', 'M.P.', '', 'Estado Finan.', '', '', 'Estado'];
  const row = ['I-0766', '46194.76393976852', '', 'INGRESOS', '', 'VENTAS', '', 'Pago (PARCIAL) Tattoo - Proyecto Fabian', '', '', '', '', '35.872.158', '', '50000.0', '', '0.0', '', 'Transferencia', '', 'PAGADO', '', '', 'COMPLETADO'];
  const resolved = resolveMovementColumnIndexes(headers);
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('from miclub.sectors')) return { rows: [{ id: 'local-1-sector' }] };
      if (sql.includes('from miclub.movement_categories')) return { rows: [{ id: 'category-1' }] };
      if (sql.includes('miclub.payment_methods')) return { rows: [{ id: 'payment-method-1' }] };
      if (sql.includes('miclub.movements')) return { rows: [{ id: 'movement-1' }] };
      return { rows: [] };
    },
  };
  const summary = createSummary();

  await processMovement(pool as never, { kind: 'movements', sheet: 'LOCAL 1', rowNumber: 11, row, movementIndexes: resolved.indexes, usedMovementFallback: false }, summary as never);

  const sectorLookup = queries.find((query) => query.sql.includes('from miclub.sectors'));
  const insert = queries.find((query) => query.sql.includes('insert into miclub.movements'));
  assert.ok(sectorLookup, 'expected sector lookup');
  assert.equal(sectorLookup.params?.[0], 'LOCAL 1');
  assert.ok(insert, 'expected a movement insert query');
  assert.equal(insert.params?.[2], 'INGRESOS');
  assert.equal(insert.params?.[5], 'Pago (PARCIAL) Tattoo - Proyecto Fabian');
  assert.equal(insert.params?.[7], 50000);
  assert.equal(insert.params?.[10], 'pagado');
  assert.equal(insert.params?.[11], 'COMPLETADO');
  assert.equal(summary.movementsProcessed, 1);
});
