import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getDashboardBasic, getSectorFinanceSummary } from "../services/dashboardService.js";
import { requirePermission } from "../middleware/authorization.js";

// productivo: dashboard bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/dashboard/basic", requirePermission("dashboard:read"), asyncHandler(async (req, res) => res.json(await getDashboardBasic(req.auth!))));
router.get("/sector-finance-summary", requirePermission("dashboard:read"), asyncHandler(async (req, res) => res.json(await getSectorFinanceSummary(req.auth!))));
router.get("/dashboard-reconciliation", requirePermission("dashboard:read"), asyncHandler(async (req, res) => {
  if (process.env.DEBUG_ENDPOINTS_ENABLED !== "true") return res.status(404).json({ error: true, message: "Endpoint de diagnóstico deshabilitado." });
  const { getDashboardReconciliation } = await import("../services/dashboardReconciliationService.js");
  res.json(await getDashboardReconciliation(req.auth!));
}));

export default router;
