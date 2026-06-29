import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/economy/summary", asyncHandler(async (_req, res) => res.json(await getEconomyClubSummary())));
router.get("/economy/sector-balances", asyncHandler(async (_req, res) => res.json(await getEconomyClubSectorBalances())));
router.get("/economy/movements", asyncHandler(async (req, res) => res.json(await listEconomyClubMovements(req.query.limit))));

export default router;
