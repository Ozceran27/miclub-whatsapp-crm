import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getActivityRankings, getActivityTrends, getAnnualSummary, getYearlyBreakdown, getByCategory, getBySector, getComparison, getInsights, getMonthlyEvolution, getPaymentMethods, getPending, getRecentMovements, getSectorRankings, getSectorTrends, getSummary } from "../services/economyService.js";
import { requirePermission } from "../middleware/authorization.js";

const router = Router();

router.get("/summary", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getSummary(req.auth!.clubId))));
router.get("/monthly-evolution", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getMonthlyEvolution(req.auth!.clubId, req.query.year))));
router.get("/by-sector", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getBySector(req.auth!.clubId, req.query.limit))));
router.get("/sector-rankings", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getSectorRankings(req.auth!.clubId, req.query.limit))));
router.get("/sector-trends", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getSectorTrends(req.auth!.clubId, req.query.year, req.query.limit))));
router.get("/activity-rankings", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getActivityRankings(req.auth!.clubId, req.query.limit))));
router.get("/activity-trends", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getActivityTrends(req.auth!.clubId, req.query.year, req.query.limit))));
router.get("/by-category", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getByCategory(req.auth!.clubId, req.query.limit))));
router.get("/payment-methods", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getPaymentMethods(req.auth!.clubId))));
router.get("/recent-movements", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getRecentMovements(req.auth!.clubId, req.query.limit))));
router.get("/pending", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getPending(req.auth!.clubId, req.query.limit))));
router.get("/annual-summary", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getAnnualSummary(req.auth!.clubId, req.query.year))));
router.get("/yearly-breakdown", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getYearlyBreakdown(req.auth!.clubId, req.query.asOf ?? req.query.year))));
router.get("/comparison", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getComparison(req.auth!.clubId))));
router.get("/insights", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getInsights(req.auth!.clubId))));

export default router;
