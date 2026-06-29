import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getDashboardBasic, getSectorFinanceSummary } from "../services/dashboardService.js";
import { getDashboardReconciliation } from "../services/dashboardReconciliationService.js";

// productivo: dashboard bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/dashboard/basic", asyncHandler(async (_req, res) => res.json(await getDashboardBasic())));
router.get("/sector-finance-summary", asyncHandler(async (_req, res) => res.json(await getSectorFinanceSummary())));
router.get("/dashboard-reconciliation", asyncHandler(async (_req, res) => res.json(await getDashboardReconciliation())));

export default router;
