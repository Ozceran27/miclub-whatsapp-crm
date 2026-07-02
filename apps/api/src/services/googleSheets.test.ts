import test from 'node:test';
import assert from 'node:assert/strict';
import { adminMovementFallbackIndexes, calculateFutureReceivableFeesUntilMonthEnd, calculateProjectedBalance, calculateReceivableFee, calculateReceivableFeesFromDebtors, normalizeSuspiciousArsFee, getReceivableCommissionRate, isCompleted, isExpense, isIncome, isPending, movementValue, normalizeMoney, normalizeOperationalStatus, normalizeSheetText, parseAulaCommissionMap, parseCommissionRate, resolveMemberColumnIndexes, resolveMovementColumnIndexes, sectorMovementFallbackIndexes } from './googleSheets.js';

test('normalizeOperationalStatus normaliza estados operativos conocidos', () => {
  assert.equal(normalizeOperationalStatus('Al Día'), 'al_dia');
  assert.equal(normalizeOperationalStatus('Al dia'), 'al_dia');
  assert.equal(normalizeOperationalStatus('Nuevo Inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('nuevo inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('Adeudando'), 'adeudando');
  assert.equal(normalizeOperationalStatus('Abandonado'), 'abandonado');
  assert.equal(normalizeOperationalStatus('Cancelado'), 'cancelado');
  assert.equal(normalizeOperationalStatus(''), 'otro');
});

test('normalizeOperationalStatus tolera espacios, saltos de línea y guiones', () => {
  assert.equal(normalizeOperationalStatus('  AL\nDÍA  '), 'al_dia');
  assert.equal(normalizeOperationalStatus('Nuevo - Inscripto'), 'nuevo_inscripto');
  assert.equal(normalizeOperationalStatus('  abandonado  '), 'abandonado');
  assert.equal(normalizeOperationalStatus('Cancelado / baja'), 'cancelado');
});


test('normalizeMoney interpreta montos argentinos y de Google Sheets sin reescalar', () => {
  assert.equal(normalizeMoney('1.081.000'), 1081000);
  assert.equal(normalizeMoney('$1.081.000'), 1081000);
  assert.equal(normalizeMoney('1.081.000,50'), 1081000.5);
  assert.equal(normalizeMoney('25.000'), 25000);
  assert.equal(normalizeMoney('$25.000'), 25000);
  assert.equal(normalizeMoney('1.400.000'), 1400000);
  assert.equal(normalizeMoney('665.000'), 665000);
  assert.equal(normalizeMoney('1081000'), 1081000);
  assert.equal(normalizeMoney(1081000), 1081000);
  assert.equal(normalizeMoney('1,081,000'), 1081000);
  assert.equal(normalizeMoney('1081.50'), 1081.5);
  assert.equal(normalizeMoney(''), 0);
  assert.equal(normalizeMoney('—'), 0);
});

test('helpers financieros normalizan texto, moneda y estados de ADMINISTRACIÓN', () => {
  assert.equal(normalizeSheetText('  ADMINISTRACIÓN  '), 'ADMINISTRACION');
  assert.equal(normalizeMoney('$ 1.234.567,89'), 1234567.89);
  assert.equal(normalizeMoney('ARS 12,50'), 12.5);
  assert.equal(normalizeMoney(''), 0);
  assert.equal(isCompleted(' completado '), true);
  assert.equal(isPending('PENDIENTE'), true);
  assert.equal(isIncome('ingresos'), true);
  assert.equal(isExpense('EGRESOS'), true);
});


test('calculateProjectedBalance resta saldosAPagar como obligación futura', () => {
  assert.equal(
    calculateProjectedBalance({
      liquidity: 1000000,
      cuotasACobrar: 500000,
      pendingNetBalance: 100000,
      saldosAPagar: 200000
    }),
    1400000
  );
});


test('calculateReceivableFee normaliza cuotas infladas y aplica comisiones por sector y actividad', () => {
  const aulaCommissionMap = { 'arte ninos': 0.4 };
  assert.equal(calculateReceivableFee({ id: '1', nombre: 'Fit', apellido: '', telefono: '1', estado: 'Adeudando', cuota: 30000, sourceSheet: 'FITNESS' }, aulaCommissionMap), 15000);
  assert.equal(calculateReceivableFee({ id: '1b', nombre: 'Fit Inflado', apellido: '', telefono: '1', estado: 'Adeudando', cuota: 8110000, sourceSheet: 'FITNESS' }, aulaCommissionMap), 405500);
  assert.equal(calculateReceivableFee({ id: '2', nombre: 'Salon', apellido: '', telefono: '1', estado: 'Adeudando', cuota: 30000, sourceSheet: 'SALON' }, aulaCommissionMap), 0);
  assert.equal(calculateReceivableFee({ id: '3', nombre: 'Aula', apellido: '', telefono: '1', estado: 'Adeudando', actividad: 'Arte - Niños', cuota: 30000, sourceSheet: 'AULA' }, aulaCommissionMap), 12000);
});

test('normalizeSuspiciousArsFee corrige cuotas importadas con escala incorrecta', () => {
  assert.equal(normalizeSuspiciousArsFee(25_000), 25_000);
  assert.equal(normalizeSuspiciousArsFee(8_110_000), 811_000);
  assert.equal(normalizeSuspiciousArsFee(25_000_000_000), 25_000_000);
  assert.equal(normalizeSuspiciousArsFee(1_234_567), 1_234_567);
});

test('parseCommissionRate interpreta porcentajes y decimales de AULA', () => {
  assert.equal(parseCommissionRate('40%'), 0.4);
  assert.equal(parseCommissionRate('0,4'), 0.4);
  assert.equal(parseCommissionRate(0.4), 0.4);
  assert.equal(parseCommissionRate('40'), 0.4);
});

test('parseAulaCommissionMap usa solo actividades EC y normaliza nombres', () => {
  const map = parseAulaCommissionMap([
    ['EC', 'Arte - Niños', '', '', '', '', '', '', '', '', '40%'],
    ['BAJA', 'Karate', '', '', '', '', '', '', '', '', '50%']
  ]);
  assert.equal(map['arte ninos'], 0.4);
  assert.equal(map.karate, undefined);
});

test('calculateReceivableFee no cuenta abandonados indirectamente ni cuotas cero', () => {
  const aulaCommissionMap = { yoga: 0.4 };
  assert.equal(calculateReceivableFee({ id: '1', nombre: 'Cero', apellido: '', telefono: '1', estado: 'Adeudando', cuota: 0, sourceSheet: 'FITNESS' }, aulaCommissionMap), 0);
  assert.equal(getReceivableCommissionRate({ id: '2', nombre: 'Ab', apellido: '', telefono: '1', estado: 'Abandonado', cuota: 30000, sourceSheet: 'SALON' }, aulaCommissionMap), 0);
  assert.equal(calculateReceivableFeesFromDebtors([{ id: '3', nombre: 'Ab', apellido: '', telefono: '1', estado: 'Abandonado', cuota: 30000, sourceSheet: 'FITNESS' }], aulaCommissionMap), 0);
});

test('calculateFutureReceivableFeesUntilMonthEnd suma vencimientos al día del mes actual', () => {
  const members: import('@miclub/shared').Member[] = [
    { id: '1', nombre: 'Fit', apellido: '', telefono: '1', estado: 'Al día', cuota: 30000, vence: '2026-06-24T00:00:00.000Z', sourceSheet: 'FITNESS' as const },
    { id: '2', nombre: 'Salon', apellido: '', telefono: '1', estado: 'Al día', cuota: 20000, vence: '2026-06-24T00:00:00.000Z', sourceSheet: 'SALON' as const },
    { id: '3', nombre: 'Aula', apellido: '', telefono: '1', estado: 'Al día', actividad: 'Arte - Niños', cuota: 30000, vence: '2026-06-24T00:00:00.000Z', sourceSheet: 'AULA' as const },
    { id: '4', nombre: 'Next', apellido: '', telefono: '1', estado: 'Al día', cuota: 30000, vence: '2026-07-01T00:00:00.000Z', sourceSheet: 'FITNESS' as const },
    { id: '5', nombre: 'Debt', apellido: '', telefono: '1', estado: 'Adeudando', cuota: 30000, vence: '2026-06-24T00:00:00.000Z', sourceSheet: 'FITNESS' as const }
  ];
  assert.equal(calculateFutureReceivableFeesUntilMonthEnd(members, { 'arte ninos': 0.4 }, new Date('2026-06-18T12:00:00.000Z')), 27000);
  assert.equal(100000 + calculateFutureReceivableFeesUntilMonthEnd(members, { 'arte ninos': 0.4 }, new Date('2026-06-18T12:00:00.000Z')), 127000);
});


test('resolveMovementColumnIndexes mapea layout real de ADMINISTRACIÓN con fallback sin estadoFinan', () => {
  const headers = ['Id.', 'Fecha', '', 'Tipo', '', '', 'Categoría', '', '', 'Concepto', '', '', '', '', 'Contra-parte', '', '', 'Sector', '', 'Monto', '', '', 'Imp.', '', 'Estado', '', 'M.P.'];
  const row = ['ADM-001', '20/06/2026', '', 'INGRESOS', '', '', 'CUOTAS', '', '', 'Cuota mensual junio', '', '', '', '', '12345678', '', '', 'ADMINISTRACIÓN', '', '$25.000', '', '', '$0', '', 'COMPLETADO', '', 'Transferencia'];
  const resolved = resolveMovementColumnIndexes(headers, adminMovementFallbackIndexes);

  assert.equal(resolved.usedFallback, false);
  assert.deepEqual(resolved.fallbackKeys, []);
  assert.equal(movementValue(row, resolved.indexes, 'id'), 'ADM-001');
  assert.equal(movementValue(row, resolved.indexes, 'fecha'), '20/06/2026');
  assert.equal(movementValue(row, resolved.indexes, 'tipo'), 'INGRESOS');
  assert.equal(movementValue(row, resolved.indexes, 'categoria'), 'CUOTAS');
  assert.equal(movementValue(row, resolved.indexes, 'concepto'), 'Cuota mensual junio');
  assert.equal(movementValue(row, resolved.indexes, 'contraparte'), '12345678');
  assert.equal(movementValue(row, resolved.indexes, 'sector'), 'ADMINISTRACIÓN');
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'monto')), 25000);
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'impuestos')), 0);
  assert.equal(movementValue(row, resolved.indexes, 'estadoFinan'), '');
  assert.equal(movementValue(row, resolved.indexes, 'estado'), 'COMPLETADO');
  assert.equal(movementValue(row, resolved.indexes, 'medioPago'), 'Transferencia');
});

test('resolveMovementColumnIndexes mapea layout real sectorial con sector derivado de hoja', () => {
  const headers = ['Id.', 'Fecha', '', 'Tipo', '', 'Categoría', '', 'Concepto', '', '', '', '', 'Contra-parte', '', 'Monto', '', 'Imp.', '', 'M.P.', '', 'Estado Finan.', '', '', 'Estado', '', '', ''];
  const row = ['SEC-001', '21/06/2026', '', 'INGRESOS', '', 'CUOTAS', '', 'Cuota fitness junio', '', '', '', '', '87654321', '', '$30.000', '', '$0', '', 'Efectivo', '', 'PAGADO', '', '', 'COMPLETADO', '', '', ''];
  const resolved = resolveMovementColumnIndexes(headers, sectorMovementFallbackIndexes);

  assert.equal(resolved.usedFallback, false);
  assert.deepEqual(resolved.fallbackKeys, []);
  assert.equal(movementValue(row, resolved.indexes, 'id'), 'SEC-001');
  assert.equal(movementValue(row, resolved.indexes, 'fecha'), '21/06/2026');
  assert.equal(movementValue(row, resolved.indexes, 'tipo'), 'INGRESOS');
  assert.equal(movementValue(row, resolved.indexes, 'categoria'), 'CUOTAS');
  assert.equal(movementValue(row, resolved.indexes, 'concepto'), 'Cuota fitness junio');
  assert.equal(movementValue(row, resolved.indexes, 'contraparte'), '87654321');
  assert.equal(movementValue(row, resolved.indexes, 'sector'), '');
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'monto')), 30000);
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'impuestos')), 0);
  assert.equal(movementValue(row, resolved.indexes, 'medioPago'), 'Efectivo');
  assert.equal(movementValue(row, resolved.indexes, 'estadoFinan'), 'PAGADO');
  assert.equal(movementValue(row, resolved.indexes, 'estado'), 'COMPLETADO');
});

test('resolveMovementColumnIndexes conserva fallback de administración sin headers', () => {
  const resolved = resolveMovementColumnIndexes(undefined, adminMovementFallbackIndexes);
  const row = ['MOV-002', '21/06/2026', '', 'EGRESOS', '', '', 'Servicios', '', '', 'Luz', '', '', '', '', 'Proveedor', '', '', 'ADMINISTRACIÓN', '', '$10.000', '', '', '$2100', '', 'PENDIENTE', '', 'Efectivo'];

  assert.equal(resolved.usedFallback, true);
  assert.ok(resolved.fallbackKeys.includes('fecha'));
  assert.equal(movementValue(row, resolved.indexes, 'id'), 'MOV-002');
  assert.equal(movementValue(row, resolved.indexes, 'concepto'), 'Luz');
  assert.equal(movementValue(row, resolved.indexes, 'sector'), 'ADMINISTRACIÓN');
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'monto')), 10000);
  assert.equal(movementValue(row, resolved.indexes, 'medioPago'), 'Efectivo');
});

test('resolveMovementColumnIndexes conserva fallback sectorial sin headers', () => {
  const resolved = resolveMovementColumnIndexes(undefined, sectorMovementFallbackIndexes);
  const row = ['MOV-003', '22/06/2026', '', 'INGRESOS', '', 'Cuotas', '', 'Cuota salón', '', '', '', '', 'Cliente', '', '$15.000', '', '$0', '', 'Mercado Pago', '', 'PAGADO', '', '', 'COMPLETADO', '', '', ''];

  assert.equal(resolved.usedFallback, true);
  assert.equal(movementValue(row, resolved.indexes, 'concepto'), 'Cuota salón');
  assert.equal(movementValue(row, resolved.indexes, 'sector'), '');
  assert.equal(normalizeMoney(movementValue(row, resolved.indexes, 'monto')), 15000);
  assert.equal(movementValue(row, resolved.indexes, 'estadoFinan'), 'PAGADO');
  assert.equal(movementValue(row, resolved.indexes, 'estado'), 'COMPLETADO');
});


test('resolveMemberColumnIndexes reconoce Estado Finan. como estado operativo', () => {
  const resolved = resolveMemberColumnIndexes(['Id.', 'Nombre', 'Estado Finan.', 'Vence']);
  assert.equal(resolved.indexes.estado, 2);
  assert.equal(resolved.indexes.vence, 3);
});
