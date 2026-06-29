import { Router } from "express";
import { getConfiguredDataSource, isPostgresEnabled } from "../config/featureFlags.js";
import { validatePostgresEnv } from "../config/env.js";
import { getPostgresHealth } from "../db/health.js";
import { auditSqliteCrmData, migrateCrmToPostgres } from "../services/crmService.js";

// migración/debug: paths bajo /api/db; no renombrar sin migración frontend.
const router = Router();

router.get("/health", async (_req, res) => {
  const postgresEnabled = isPostgresEnabled();
  const dataSource = getConfiguredDataSource();

  if (!postgresEnabled) {
    return res.json({
      ok: true,
      postgresEnabled: false,
      dataSource,
      message: "PostgreSQL deshabilitado; se mantiene el origen legacy."
    });
  }

  const warnings = validatePostgresEnv();
  if (warnings.length > 0) {
    return res.status(503).json({ ok: false, postgresEnabled: true, dataSource, warnings });
  }

  try {
    const health = await getPostgresHealth();
    return res.json({ ok: true, postgresEnabled: true, dataSource, ...health });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar PostgreSQL.";
    return res.status(503).json({ ok: false, postgresEnabled: true, dataSource, message });
  }
});


router.get("/crm/audit", async (_req, res) => {
  try {
    res.json(await auditSqliteCrmData());
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo auditar CRM legacy.";
    res.status(500).json({ error: true, message });
  }
});

router.post("/crm/migrate", async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  const phase = ["templates", "history", "all"].includes(req.body?.phase) ? req.body.phase : "all";
  try {
    res.json(await migrateCrmToPostgres({ dryRun, phase }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo migrar CRM a PostgreSQL.";
    res.status(500).json({ error: true, message });
  }
});

export default router;
