import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import importRoutes, { parseBatchSize } from './importRoutes.js';

test('parseBatchSize acepta enteros positivos y strings numéricos', () => {
  assert.equal(parseBatchSize(25), 25);
  assert.equal(parseBatchSize('75'), 75);
});

test('parseBatchSize usa fallback para valores inválidos', () => {
  assert.equal(parseBatchSize(0), 50);
  assert.equal(parseBatchSize(-1), 50);
  assert.equal(parseBatchSize(1.5), 50);
  assert.equal(parseBatchSize('abc'), 50);
});

test('parseBatchSize limita valores mayores al máximo permitido', () => {
  assert.equal(parseBatchSize(250), 200);
});


const withImportServer = async (fn: (baseUrl: string) => Promise<void>) => {
  const previousFlag = process.env.IMPORT_ENDPOINTS_ENABLED;
  process.env.IMPORT_ENDPOINTS_ENABLED = 'true';

  const app = express();
  app.use(express.json());
  app.use('/api/import', importRoutes);

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    if (previousFlag === undefined) {
      delete process.env.IMPORT_ENDPOINTS_ENABLED;
    } else {
      process.env.IMPORT_ENDPOINTS_ENABLED = previousFlag;
    }
  }
};

test('POST /api/import/google-sheets rechaza batchSize inválido', async () => {
  await withImportServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/import/google-sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 0 })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: true, message: 'batchSize debe ser un entero positivo.' });
  });
});
