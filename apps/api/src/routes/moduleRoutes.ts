import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";
import { requirePermission } from "../middleware/authorization.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/economy/summary", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getEconomyClubSummary(req.auth!.clubId))));
router.get("/economy/sector-balances", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await getEconomyClubSectorBalances(req.auth!.clubId))));
router.get("/economy/movements", requirePermission("finance:read"), asyncHandler(async (req, res) => res.json(await listEconomyClubMovements(req.auth!.clubId, req.query.limit))));

export default router;
