import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getDashboardBasic, getSectorFinanceSummary } from "../services/dashboardService.js";

const router = Router();

router.get("/dashboard/basic", asyncHandler(async (_req, res) => res.json(await getDashboardBasic())));
router.get("/sector-finance-summary", asyncHandler(async (_req, res) => res.json(await getSectorFinanceSummary())));

export default router;
