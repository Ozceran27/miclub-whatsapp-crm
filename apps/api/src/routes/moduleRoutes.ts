import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";
import { requirePermission } from "../middleware/authorization.js";
import { withTenantTransaction } from "../db/transaction.js";
import { resolveClubCapabilities } from "../services/clubCapabilityService.js";
import { listNavigableSectors } from "../repositories/navigationRepository.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/navigation", requirePermission(PERMISSIONS.DASHBOARD_READ), asyncHandler(async (req, res) => {
  const {sectors,capabilities}=await withTenantTransaction(req.auth!.clubId,async db=>({
    sectors:await listNavigableSectors(req.auth!.clubId,db),
    capabilities:await resolveClubCapabilities(req.auth!.clubId,db),
  }));
  res.set("Cache-Control", "private, no-store");
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
