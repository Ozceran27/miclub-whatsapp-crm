import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getAnnualSummary, getYearlyBreakdown, getByCategory, getBySector, getComparison, getInsights, getMonthlyEvolution, getPaymentMethods, getPending, getRecentMovements, getSectorRankings, getSummary } from "../services/economyService.js";

const router = Router();

router.get("/summary", asyncHandler(async (req, res) => res.json(await getSummary(req.auth!.clubId))));
router.get("/monthly-evolution", asyncHandler(async (req, res) => res.json(await getMonthlyEvolution(req.auth!.clubId, req.query.year))));
router.get("/by-sector", asyncHandler(async (req, res) => res.json(await getBySector(req.auth!.clubId, req.query.limit))));
router.get("/sector-rankings", asyncHandler(async (req, res) => res.json(await getSectorRankings(req.auth!.clubId, req.query.limit))));
router.get("/by-category", asyncHandler(async (req, res) => res.json(await getByCategory(req.auth!.clubId, req.query.limit))));
router.get("/payment-methods", asyncHandler(async (req, res) => res.json(await getPaymentMethods(req.auth!.clubId))));
router.get("/recent-movements", asyncHandler(async (req, res) => res.json(await getRecentMovements(req.auth!.clubId, req.query.limit))));
router.get("/pending", asyncHandler(async (req, res) => res.json(await getPending(req.auth!.clubId, req.query.limit))));
router.get("/annual-summary", asyncHandler(async (req, res) => res.json(await getAnnualSummary(req.auth!.clubId, req.query.year))));
router.get("/yearly-breakdown", asyncHandler(async (req, res) => res.json(await getYearlyBreakdown(req.auth!.clubId, req.query.asOf ?? req.query.year))));
router.get("/comparison", asyncHandler(async (req, res) => res.json(await getComparison(req.auth!.clubId))));
router.get("/insights", asyncHandler(async (req, res) => res.json(await getInsights(req.auth!.clubId))));

export default router;
