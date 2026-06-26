import { Router } from "express";
import { DATA_SOURCE, POSTGRES_ENABLED } from "../config/featureFlags.js";
import { validatePostgresEnv } from "../config/env.js";
import { getPostgresHealth } from "../db/health.js";

const router = Router();

router.get("/health", async (_req, res) => {
  if (!POSTGRES_ENABLED) {
    return res.json({
      ok: true,
      postgresEnabled: false,
      dataSource: DATA_SOURCE,
      message: "PostgreSQL deshabilitado; se mantiene el origen legacy."
    });
  }

  const warnings = validatePostgresEnv();
  if (warnings.length > 0) {
    return res.status(503).json({ ok: false, postgresEnabled: true, dataSource: DATA_SOURCE, warnings });
  }

  try {
    const health = await getPostgresHealth();
    return res.json({ ok: true, postgresEnabled: true, dataSource: DATA_SOURCE, ...health });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar PostgreSQL.";
    return res.status(503).json({ ok: false, postgresEnabled: true, dataSource: DATA_SOURCE, message });
  }
});

export default router;
