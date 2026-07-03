import { Router } from "express";
import { getConfiguredDataSource, isPostgresEnabled } from "../config/featureFlags.js";
import { validatePostgresEnv } from "../config/env.js";
import { getPostgresHealth } from "../db/health.js";
import { getPostgresPool } from "../db/postgres.js";
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

router.get("/enrollment-fee-audit", async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const params: unknown[] = [];
    const where: string[] = [];
    const addParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (typeof req.query.batchId === "string" && req.query.batchId.trim()) {
      where.push(`efa.import_batch_id = ${addParam(req.query.batchId.trim())}::uuid`);
    }
    if (typeof req.query.sheet === "string" && req.query.sheet.trim()) {
      where.push(`efa.source_sheet = ${addParam(req.query.sheet.trim())}`);
    }
    if (typeof req.query.activity === "string" && req.query.activity.trim()) {
      where.push(`lower(a.name) like lower(${addParam(`%${req.query.activity.trim()}%`)})`);
    }
    if (typeof req.query.student === "string" && req.query.student.trim()) {
      where.push(`lower(concat_ws(' ', p.first_name, p.last_name)) like lower(${addParam(`%${req.query.student.trim()}%`)})`);
    }

    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;
    const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
    const result = await pool.query<{ receivable_fee: string | number | null } & Record<string, unknown>>(
      `select efa.id, efa.import_batch_id, efa.enrollment_id, efa.source_sheet, efa.source_row_number,
              efa.raw_fee_text, efa.parsed_fee_amount, efa.normalized_fee_amount,
              efa.normalization_factor, efa.normalization_reason, efa.commission_rate,
              efa.receivable_fee, efa.created_at, p.first_name, p.last_name, p.dni,
              a.name as activity_name, s.name as sector_name
       from miclub.enrollment_fee_audit efa
       join miclub.enrollments e on e.id = efa.enrollment_id
       join miclub.people p on p.id = e.person_id
       join miclub.activities a on a.id = e.activity_id
       join miclub.sectors s on s.id = a.sector_id
       ${whereSql}
       order by efa.created_at desc, efa.source_sheet, efa.source_row_number
       limit ${limit}`,
      params,
    );
    const totalReceivableFee = result.rows.reduce((sum, row) => sum + Number(row.receivable_fee ?? 0), 0);
    res.json({ count: result.rows.length, totalReceivableFee, rows: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar la auditoría de cuotas.";
    res.status(500).json({ error: true, message });
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
