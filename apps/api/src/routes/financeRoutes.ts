import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getOperationalBalances, getSectorSettlements, listMovements, listPayments, listReceivables } from "../services/financeService.js";
import { parseListQuery } from "./listQuery.js";
import { requirePermission } from "../middleware/authorization.js";

// productivo: finanzas bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/movements", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["from", "to", "type", "status", "sectorId", "personId"]);
  res.json(await listMovements(req.auth!, { limit, offset, ...filters }));
}));
router.get("/receivables", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["dueFrom", "dueTo", "status", "personId", "enrollmentId"]);
  res.json(await listReceivables(req.auth!, { limit, offset, ...filters }));
}));
router.get("/payments", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["from", "to", "personId", "paymentMethodId"]);
  res.json(await listPayments(req.auth!, { limit, offset, ...filters }));
}));
router.get("/operational-balances", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getOperationalBalances(req.auth!))));
router.get("/sector-settlements", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => res.json(await getSectorSettlements(req.auth!))));

export default router;
