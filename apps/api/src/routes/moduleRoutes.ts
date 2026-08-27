import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";
import { requirePermission } from "../middleware/authorization.js";
import { getPostgresPool } from "../db/postgres.js";
import { resolveClubCapabilities } from "../services/clubCapabilityService.js";
import { listNavigableSectors } from "../repositories/navigationRepository.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/navigation", requirePermission(PERMISSIONS.DASHBOARD_READ), asyncHandler(async (req, res) => {
  const pool = await getPostgresPool();
  const [sectors, capabilities] = await Promise.all([
    listNavigableSectors(req.auth!.clubId, pool),
    resolveClubCapabilities(req.auth!.clubId, pool),
  ]);
  res.set("Cache-Control", "private, max-age=60");
  res.vary("Cookie");
  res.json({
    modules: ["home", "economy", "crm", "administration", "dataMigration"],
    sectors,
    capabilities,
  });
}));

router.get("/economy/summary", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getEconomyClubSummary(req.auth!.clubId))));
router.get("/economy/sector-balances", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getEconomyClubSectorBalances(req.auth!.clubId))));
router.get("/economy/movements", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await listEconomyClubMovements(req.auth!.clubId, req.query.limit))));

export default router;
