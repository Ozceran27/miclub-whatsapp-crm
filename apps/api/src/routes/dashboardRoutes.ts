import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getDashboardBasic, getSectorFinanceSummary } from "../services/dashboardService.js";
import { getDashboardReconciliation } from "../services/dashboardReconciliationService.js";

// productivo: dashboard bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/dashboard/basic", asyncHandler(async (req, res) => res.json(await getDashboardBasic(req.auth!))));
router.get("/sector-finance-summary", asyncHandler(async (req, res) => res.json(await getSectorFinanceSummary(req.auth!))));
router.get("/dashboard-reconciliation", asyncHandler(async (req, res) => res.json(await getDashboardReconciliation(req.auth!))));

export default router;
