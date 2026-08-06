import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";
import express from "express";
import type { RequestAuthContext } from "../auth/types.js";
import sectorMutationRoutes from "./sectorMutationRoutes.js";

const SECTOR_ID = "44444444-4444-4444-8444-444444444444";
const auth: RequestAuthContext = {
  userId: "user-1", personId: "person-1", email: "director@club.test", legacy: false,
  clubId: "club-1", membershipId: "membership-1", role: "Director",
  permissions: ["sectors.edit", "sectors.archive"], sectorIds: [SECTOR_ID],
};

const withServer = async (context: RequestAuthContext, run: (baseUrl: string) => Promise<void>) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = context; next(); });
  app.use("/api", sectorMutationRoutes);
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const patchSector = (baseUrl: string, id = SECTOR_ID, body: Record<string, unknown> = {
  updatedAt: "2026-08-05T12:00:00.000Z", name: "Fitness",
}) => fetch(`${baseUrl}/api/sectors/${id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("rechaza el acceso a un sector de otro club antes de consultar el repositorio", async () => {
  await withServer(auth, async (baseUrl) => {
    const response = await patchSector(baseUrl, "55555555-5555-4555-8555-555555555555");
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "FORBIDDEN", message: "Acceso al sector denegado" });
  });
});

test("rechaza un permiso insuficiente antes de validar o persistir", async () => {
  await withServer({ ...auth, permissions: [] }, async (baseUrl) => {
    const response = await patchSector(baseUrl);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "FORBIDDEN", message: "Permiso insuficiente" });
  });
});

test("rechaza payloads inválidos sin acceder a la base", async () => {
  await withServer(auth, async (baseUrl) => {
    const response = await patchSector(baseUrl, SECTOR_ID, {
      updatedAt: "fecha-inválida", name: "", clubId: "otro-club",
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, "VALIDATION_ERROR");
  });
});
