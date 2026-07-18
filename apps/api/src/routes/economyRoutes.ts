import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getAnnualSummary, getByCategory, getBySector, getComparison, getInsights, getMonthlyEvolution, getPaymentMethods, getPending, getRecentMovements, getSectorRankings, getSummary } from "../services/economyService.js";

const router = Router();

router.get("/summary", asyncHandler(async (_req, res) => res.json(await getSummary())));
router.get("/monthly-evolution", asyncHandler(async (req, res) => res.json(await getMonthlyEvolution(req.query.year))));
router.get("/by-sector", asyncHandler(async (req, res) => res.json(await getBySector(req.query.limit))));
router.get("/sector-rankings", asyncHandler(async (req, res) => res.json(await getSectorRankings(req.query.limit))));
router.get("/by-category", asyncHandler(async (req, res) => res.json(await getByCategory(req.query.limit))));
router.get("/payment-methods", asyncHandler(async (_req, res) => res.json(await getPaymentMethods())));
router.get("/recent-movements", asyncHandler(async (req, res) => res.json(await getRecentMovements(req.query.limit))));
router.get("/pending", asyncHandler(async (req, res) => res.json(await getPending(req.query.limit))));
router.get("/annual-summary", asyncHandler(async (req, res) => res.json(await getAnnualSummary(req.query.year))));
router.get("/comparison", asyncHandler(async (_req, res) => res.json(await getComparison())));
router.get("/insights", asyncHandler(async (_req, res) => res.json(await getInsights())));

export default router;
