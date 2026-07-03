import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertActivity } from './activitiesRepository.js';

test('upsertActivity permite que una importación normalizada baje monthly_fee y audita el cambio', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'activity-1' }] };
    },
  };

  const id = await upsertActivity(pool as never, {
    sectorId: 'sector-1',
    name: 'Musculación',
    modality: 'Mensual',
    instructorId: 'instructor-1',
    monthlyFee: 30000,
    monthlyFeeSource: 'google_sheets_import',
    monthlyFeeRawText: '300000',
    monthlyFeeRawAmount: 300000,
    monthlyFeeNormalizationReason: 'scale_adjustment:300000->30000',
    importBatchId: '00000000-0000-0000-0000-000000000001',
  });

  assert.equal(id, 'activity-1');
  const query = queries[0];
  assert.ok(query, 'expected upsert query');
  assert.equal(query.params?.[4], 30000);
  assert.equal(query.params?.[6], true, 'expected monthly fee update to be enabled for normalized imports');
  assert.equal(query.params?.[9], '300000');
  assert.equal(query.params?.[10], 300000);
  assert.equal(query.params?.[11], 'scale_adjustment:300000->30000');
  assert.match(query.sql, /monthly_fee = case\s+when \$7::boolean then excluded\.monthly_fee\s+else miclub\.activities\.monthly_fee/s);
  assert.match(query.sql, /insert into miclub\.activity_fee_history/);
  assert.doesNotMatch(query.sql, /greatest\(miclub\.activities\.monthly_fee, excluded\.monthly_fee\)/);
});

test('upsertActivity no pisa monthly_fee cuando la cuota del import viene en blanco', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'activity-1' }] };
    },
  };

  await upsertActivity(pool as never, {
    sectorId: 'sector-1',
    name: 'Musculación',
    instructorId: 'instructor-1',
  });

  assert.equal(queries[0]?.params?.[6], false, 'blank import fee must not overwrite the stored activity fee');
});
