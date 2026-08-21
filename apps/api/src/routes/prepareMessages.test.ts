import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import type { Member } from '@miclub/shared';
// This is an explicit compatibility fixture. The productive service remains
// PostgreSQL-only; persistence is injected so this route test stays hermetic.
const { default: db } = await import('../legacy/sqlite/sqlite.js');
const { createCrmRoutes } = await import('./crmRoutes.js');

const memberId = '1';
const templateMessage = 'Hola {nombre}, deuda de {actividad}.';

type PreparedRouteMessage = {
  historyId: number;
  memberId: string;
  status: string;
  message: string;
};

const debtor: Member = {
  id: memberId, nombre: 'Lucía', apellido: 'Gómez', telefono: '5491162341133',
  actividad: 'Fitness', modalidad: 'Mensual', cuota: 1000, estado: 'Adeudando',
  instructor: 'Test', sourceSheet: 'FITNESS'
};
const app = express();
app.use(express.json());
app.use(createCrmRoutes({
  getMembersSource: () => Promise.resolve({ members: [debtor] }),
  isDebtorMember: () => true,
  insertHistory: async (_clubId, history) => {
    const result = await new Promise<{ lastID: number }>((resolve, reject) => {
      db.run(
        `INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, status, createdAt, templateName)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [history.memberId, history.nombre, history.phone, history.message, history.waLink, history.status, history.status, history.createdAt, history.templateName],
        function (err) { if (err) reject(err); else resolve({ lastID: this.lastID }); }
      );
    });
    return { ...history, historyId: result.lastID };
  }
}));

const runDb = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const getDb = <T>(sql: string, params: unknown[] = []) =>
  new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

const cleanMemberHistory = () => runDb('DELETE FROM message_history WHERE memberId = ?', [memberId]);

const insertHistoricalMessage = (status: string) =>
  runDb(
    `INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, status, createdAt, templateName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memberId, 'Lucía Gómez', '5491162341133', `Mensaje previo ${status}`, 'https://web.whatsapp.com/send?phone=5491162341133', status, status, new Date(Date.now() - 60_000).toISOString(), 'Histórico']
  );

const prepareMessage = async (baseUrl: string) => {
  const response = await fetch(`${baseUrl}/prepare-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds: [memberId], message: templateMessage, templateName: 'Test' })
  });

  assert.equal(response.status, 200);
  return (await response.json()) as PreparedRouteMessage[];
};

const withServer = async (fn: (baseUrl: string) => Promise<void>) => {
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
  }
};

test.beforeEach(async () => {
  await cleanMemberHistory();
});

test.after(async () => {
  await cleanMemberHistory();
});

test('POST /prepare-messages prepara un mensaje sin historial previo', async () => {
  await withServer(async (baseUrl) => {
    const prepared = await prepareMessage(baseUrl);

    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].memberId, memberId);
    assert.equal(prepared[0].status, 'prepared');
  });
});

for (const status of ['pending', 'opened', 'sent_manual', 'skipped']) {
  test(`POST /prepare-messages prepara un mensaje aunque exista historial ${status}`, async () => {
    await insertHistoricalMessage(status);

    await withServer(async (baseUrl) => {
      const prepared = await prepareMessage(baseUrl);
      const count = await getDb<{ total: number }>('SELECT COUNT(*) as total FROM message_history WHERE memberId = ?', [memberId]);

      assert.equal(prepared.length, 1);
      assert.equal(prepared[0].memberId, memberId);
      assert.equal(prepared[0].status, 'prepared');
      assert.equal(count?.total, 2);
    });
  });
}

test('POST /prepare-messages permite preparar dos veces seguidas el mismo contacto y conserva ambos registros', async () => {
  await withServer(async (baseUrl) => {
    const first = await prepareMessage(baseUrl);
    const second = await prepareMessage(baseUrl);
    const count = await getDb<{ total: number }>('SELECT COUNT(*) as total FROM message_history WHERE memberId = ?', [memberId]);

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.notEqual(first[0].historyId, second[0].historyId);
    assert.equal(count?.total, 2);
  });
});
