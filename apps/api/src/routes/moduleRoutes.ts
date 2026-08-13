import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "../services/economyClubService.js";
import { requirePermission } from "../middleware/authorization.js";
import { getPostgresPool } from "../db/postgres.js";

// productivo: módulos bajo /api/modules; no renombrar sin migración frontend.
const router = Router();

router.get("/navigation", requirePermission(PERMISSIONS.DASHBOARD_READ), asyncHandler(async (req, res) => {
  const sectors = await (await getPostgresPool()).query<{ id: string; name: string; code: string | null }>(
    `select id, name, code from miclub.sectors
     where club_id=$1 and archived_at is null and coalesce(operational_status, 'active') <> 'inactive'
     order by name`, [req.auth!.clubId],
  );
  res.json({
    modules: ["home", "economy", "crm", "administration", "dataMigration"],
    sectors: sectors.rows,
  });
}));

router.get("/economy/summary", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getEconomyClubSummary(req.auth!.clubId))));
router.get("/economy/sector-balances", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getEconomyClubSectorBalances(req.auth!.clubId))));
router.get("/economy/movements", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await listEconomyClubMovements(req.auth!.clubId, req.query.limit))));

export default router;
