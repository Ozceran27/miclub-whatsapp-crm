import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Server } from "node:http";
import financeRoutes from "./financeRoutes.js";

test("la API financiera no expone borrado físico de movimientos ni pagos", async () => {
  const app = express();
  app.use("/api", financeRoutes);
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    for (const resource of ["movements", "payments"]) {
      const httpResponse: Awaited<ReturnType<typeof fetch>> = await fetch(`http://127.0.0.1:${address.port}/api/${resource}/11111111-1111-4111-8111-111111111111`, { method: "DELETE" });
      assert.equal(httpResponse.status, 404, `DELETE /api/${resource}/:id debe ser inexistente`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
