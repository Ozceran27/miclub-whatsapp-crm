import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/economy/summary", asyncHandler(async (req, res) => res.json(await getEconomyClubSummary(req.auth!.clubId))));
router.get("/economy/sector-balances", asyncHandler(async (req, res) => res.json(await getEconomyClubSectorBalances(req.auth!.clubId))));
router.get("/economy/movements", asyncHandler(async (req, res) => res.json(await listEconomyClubMovements(req.auth!.clubId, req.query.limit))));

export default router;
