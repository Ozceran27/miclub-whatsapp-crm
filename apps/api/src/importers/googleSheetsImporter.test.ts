import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMissingEnrollmentStrategy, processMember, processMovement } from './googleSheetsImporter.js';
import { movementValue, resolveMemberColumnIndexes, resolveMovementColumnIndexes, sectorMovementFallbackIndexes } from '../services/googleSheets.js';
import { formatArgentinaTimestampForPostgres, formatDateOnlyForPostgres, parseArgentinianDate, parseSheetDateToLocalDate } from './normalizers.js';


test('parseMissingEnrollmentStrategy usa archive por defecto y acepta aliases de archivado', () => {
  assert.equal(parseMissingEnrollmentStrategy(undefined), 'archive');
  assert.equal(parseMissingEnrollmentStrategy('archive'), 'archive');
  assert.equal(parseMissingEnrollmentStrategy('supersede'), 'archive');
  assert.equal(parseMissingEnrollmentStrategy('replace'), 'archive');
  assert.equal(parseMissingEnrollmentStrategy('inactive'), 'inactive');
  assert.equal(parseMissingEnrollmentStrategy('abandonado'), 'abandon');
});

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
  movementFallbacks: { safeColumn: 0, fullLayout: 0 },
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


test('processMovement advierte columnas fallback de movimientos por nombre', async () => {
  const pool = { query: async () => { throw new Error('No debería consultar la base para filas vacías.'); } };
  const summary = createSummary();

  await processMovement(pool as never, {
    kind: 'movements',
    sheet: 'FITNESS',
    rowNumber: 44,
    row: [],
    movementIndexes: {},
    usedMovementFallback: true,
    movementFallbackKeys: ['medioPago'],
    movementHeadersFound: true,
  }, summary as never);

  assert.deepEqual(summary.warnings, ['Se usaron índices fallback seguros para movimientos en FITNESS: medioPago']);
});

test('processMovement advierte fallback completo cuando no hay headers de movimientos', async () => {
  const pool = { query: async () => { throw new Error('No debería consultar la base para filas vacías.'); } };
  const summary = createSummary();

  await processMovement(pool as never, {
    kind: 'movements',
    sheet: 'FITNESS',
    rowNumber: 45,
    row: [],
    movementIndexes: {},
    usedMovementFallback: true,
    movementFallbackKeys: ['id', 'fecha', 'medioPago'],
    movementHeadersFound: false,
  }, summary as never);

  assert.deepEqual(summary.warnings, ['No se encontraron headers de movimientos en FITNESS; se usó fallback completo']);
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

test('processMember usa headers reales de FITNESS y completa due_date desde Vence en BA', async () => {
  const headers = ['Id.', 'Fecha', '', '', 'Nombre', '', '', 'Apellido', '', '', 'D.N.I.', '', 'Tel.', '', 'Actividad', '', 'Modalidad', '', 'Cuota', '', 'Estado', '', '', 'Instructor', '', 'Vence'];
  const row = ['F-001', '01/06/2026', '', '', 'Ana', '', '', 'Fit', '', '', '30111222', '', '11 5555-0001', '', 'Musculación', '', 'Mensual', '', '30000', '', 'Al Día', '', '', 'Profe Fit', '', '25/07/2026'];
  const resolved = resolveMemberColumnIndexes(headers);
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = createMemberPool(queries);
  const summary = createSummary();

  await processMember(pool as never, { kind: 'members', sheet: 'FITNESS', rowNumber: 20, row, memberIndexes: resolved.indexes, usedMemberFallback: false }, summary as never);

  const insert = queries.find((query) => query.sql.includes('insert into miclub.enrollments'));
  assert.ok(insert, 'expected an enrollment insert query');
  assert.equal(insert.params?.[5], '2026-07-25');
});

test('processMember usa headers reales de SALON y completa due_date desde Vence en BB', async () => {
  const headers = ['Id.', 'Fecha', '', '', 'Nombre', '', '', 'Apellido', '', '', 'D.N.I.', '', 'Tel.', '', 'Actividad', '', 'Modalidad', '', 'Cuota', '', 'Estado', '', '', 'Instructor', '', '', 'Vence'];
  const row = ['S-001', '01/06/2026', '', '', 'Bruno', '', '', 'Salon', '', '', '32111222', '', '11 5555-0002', '', 'Salsa', '', 'Grupal', '', '20000', '', 'Al Día', '', '', 'Profe Salon', '', '', '26/07/2026'];
  const resolved = resolveMemberColumnIndexes(headers);
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = createMemberPool(queries);
  const summary = createSummary();

  await processMember(pool as never, { kind: 'members', sheet: 'SALON', rowNumber: 34, row, memberIndexes: resolved.indexes, usedMemberFallback: false }, summary as never);

  const insert = queries.find((query) => query.sql.includes('insert into miclub.enrollments'));
  assert.ok(insert, 'expected an enrollment insert query');
  assert.equal(insert.params?.[5], '2026-07-26');
});

test('processMember usa headers reales de AULA y completa due_date desde Vence en BB', async () => {
  const headers = ['Id.', 'Fecha', '', '', 'Nombre', '', '', 'Apellido', '', '', 'D.N.I.', '', 'Tel.', '', 'Actividad', '', 'Modalidad', '', 'Cuota', '', 'Estado', '', '', 'Instructor', '', '', 'Vence'];
  const row = ['A-001', '01/06/2026', '', '', 'Carla', '', '', 'Aula', '', '', '33111222', '', '11 5555-0003', '', 'Arte', '', 'Niños', '', '25000', '', 'Al Día', '', '', 'Profe Aula', '', '', '27/07/2026'];
  const resolved = resolveMemberColumnIndexes(headers);
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = createMemberPool(queries);
  const summary = createSummary();

  await processMember(pool as never, { kind: 'members', sheet: 'AULA', rowNumber: 34, row, memberIndexes: resolved.indexes, usedMemberFallback: false }, summary as never);

  const insert = queries.find((query) => query.sql.includes('insert into miclub.enrollments'));
  assert.ok(insert, 'expected an enrollment insert query');
  assert.equal(insert.params?.[5], '2026-07-27');
});

const createMemberPool = (queries: Array<{ sql: string; params?: unknown[] }>) => ({
  query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (sql.includes('from miclub.sectors')) return { rows: [{ id: 'sector-1' }] };
    if (sql.includes('from miclub.people')) return { rows: [] };
    if (sql.includes('insert into miclub.people')) return { rows: [{ id: `person-${queries.length}` }] };
    if (sql.includes('miclub.instructors')) return { rows: [{ id: 'instructor-1' }] };
    if (sql.includes('miclub.activities')) return { rows: [{ id: 'activity-1' }] };
    if (sql.includes('miclub.enrollments')) return { rows: [{ id: 'enrollment-1' }] };
    return { rows: [] };
  },
});

test('resolveMovementColumnIndexes resuelve headers reales sectoriales sin fallback semántico', () => {
  const headers = ['Id.', 'Fecha', '', 'Tipo', '', 'Categoría', '', 'Concepto', '', '', '', '', 'Contra-parte', '', 'Monto', '', 'Impuestos', '', 'M.P.', '', 'Estado Finan.', '', '', 'Estado', '', '', 'Id.'];
  for (const sheet of ['FITNESS', 'SALON', 'AULA', 'LOCAL 1']) {
    const resolved = resolveMovementColumnIndexes(headers, sectorMovementFallbackIndexes);
    assert.equal(resolved.usedFallback, false, `${sheet} no debería usar fallback`);
    assert.equal(resolved.fallbackMode, 'none');
    const row = ['I-0001', '01/06/2026', '', 'INGRESOS', '', 'CUOTA', '', `Concepto ${sheet}`, '', '', '', '', '30.111.222', '', '12345', '', '0', '', 'Transferencia', '', 'PAGADO', '', '', 'COMPLETADO', '', '', 'M-001'];
    assert.deepEqual({
      id: movementValue(row, resolved.indexes, 'id'),
      fecha: movementValue(row, resolved.indexes, 'fecha'),
      tipo: movementValue(row, resolved.indexes, 'tipo'),
      categoria: movementValue(row, resolved.indexes, 'categoria'),
      concepto: movementValue(row, resolved.indexes, 'concepto'),
      contraparte: movementValue(row, resolved.indexes, 'contraparte'),
      monto: movementValue(row, resolved.indexes, 'monto'),
      impuestos: movementValue(row, resolved.indexes, 'impuestos'),
      medioPago: movementValue(row, resolved.indexes, 'medioPago'),
      estadoFinan: movementValue(row, resolved.indexes, 'estadoFinan'),
      estado: movementValue(row, resolved.indexes, 'estado'),
    }, {
      id: 'I-0001', fecha: '01/06/2026', tipo: 'INGRESOS', categoria: 'CUOTA', concepto: `Concepto ${sheet}`, contraparte: '30.111.222', monto: '12345', impuestos: '0', medioPago: 'Transferencia', estadoFinan: 'PAGADO', estado: 'COMPLETADO'
    });
  }
});

test('resolveMovementColumnIndexes resuelve headers reales de ADMINISTRACIÓN sin fallback', () => {
  const headers = ['Id.', 'Fecha', '', 'Tipo', '', '', 'Categoría', '', '', 'Concepto', '', '', '', '', 'Contra-parte', '', '', 'Sector', '', 'Monto', '', '', 'Impuestos', '', 'Estado', '', 'M.P.'];
  const resolved = resolveMovementColumnIndexes(headers);
  assert.equal(resolved.usedFallback, false);
  assert.equal(resolved.fallbackMode, 'none');
  const row = ['ADM-1', '02/06/2026', '', 'EGRESOS', '', '', 'SERVICIOS', '', '', 'Luz', '', '', '', '', 'Proveedor', '', '', 'FITNESS', '', '9000', '', '', '0', '', 'PENDIENTE', '', 'Efectivo'];
  assert.equal(movementValue(row, resolved.indexes, 'sector'), 'FITNESS');
  assert.equal(movementValue(row, resolved.indexes, 'medioPago'), 'Efectivo');
});

test('processMovement contabiliza fallback seguro y fallback completo por separado', async () => {
  const pool = { query: async () => { throw new Error('No debería consultar la base para filas vacías.'); } };
  const summary = createSummary();

  await processMovement(pool as never, { kind: 'movements', sheet: 'FITNESS', rowNumber: 1, row: [], movementIndexes: {}, usedMovementFallback: true, movementFallbackKeys: ['medioPago'], movementHeadersFound: true, movementFallbackMode: 'column' }, summary as never);
  await processMovement(pool as never, { kind: 'movements', sheet: 'SALON', rowNumber: 1, row: [], movementIndexes: {}, usedMovementFallback: true, movementFallbackKeys: ['id'], movementHeadersFound: false, movementFallbackMode: 'layout' }, summary as never);

  assert.deepEqual(summary.movementFallbacks, { safeColumn: 1, fullLayout: 1 });
});

test('parseSheetDateToLocalDate conserva fechas de Sheets sin desfase horario', () => {
  assert.equal(parseArgentinianDate('01/07/2026'), '2026-07-01');
  assert.equal(parseSheetDateToLocalDate('01/07/2026'), '2026-07-01');
  assert.equal(parseSheetDateToLocalDate('30/06/2026'), '2026-06-30');
  assert.equal(parseSheetDateToLocalDate('26/06/2026'), '2026-06-26');
  assert.equal(parseSheetDateToLocalDate('31/07/2026'), '2026-07-31');
  assert.equal(parseSheetDateToLocalDate('1/7/2026'), '2026-07-01');
  assert.equal(parseSheetDateToLocalDate('2026-07-01'), '2026-07-01');
  assert.equal(parseSheetDateToLocalDate(46204), '2026-07-01');
  assert.equal(parseSheetDateToLocalDate(new Date(2026, 6, 1, 12)), '2026-07-01');
  assert.equal(formatDateOnlyForPostgres('01/07/2026'), '2026-07-01');
  assert.equal(formatArgentinaTimestampForPostgres('01/07/2026'), '2026-07-01 00:00:00 America/Argentina/Buenos_Aires');
});

test('processMovement envía timestamp explícito de Argentina para evitar desfase de un día', async () => {
  const headers = ['ID', 'Fecha', '', 'Tipo', '', '', 'Categoria', '', '', 'Concepto', '', '', '', '', 'Contraparte', '', '', 'Sector', '', 'Monto', '', '', 'Impuestos', '', 'Estado Finan.', 'Estado', 'Medio Pago'];
  const row = ['JUL-001', '01/07/2026', '', 'INGRESOS', '', '', 'CUOTA', '', '', 'Cuota julio', '', '', '', '', 'Alumno', '', '', 'FITNESS', '', '1000', '', '', '0', '', 'PAGADO', 'COMPLETADO', 'Transferencia'];
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

  await processMovement(pool as never, { kind: 'movements', sheet: 'FITNESS', rowNumber: 99, row, movementIndexes: resolved.indexes, usedMovementFallback: false }, summary as never);

  const insert = queries.find((query) => query.sql.includes('insert into miclub.movements'));
  assert.ok(insert, 'expected a movement insert query');
  assert.equal(insert.params?.[1], '2026-07-01 00:00:00 America/Argentina/Buenos_Aires');
});
