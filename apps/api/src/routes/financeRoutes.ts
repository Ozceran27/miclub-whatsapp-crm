import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getOperationalBalances, getSectorSettlements, listMovements, listPayments, listReceivables } from "../services/financeService.js";
import { parseListQuery } from "./listQuery.js";

// productivo: finanzas bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/movements", asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["from", "to", "type", "status", "sectorId", "personId"]);
  res.json(await listMovements(req.auth!, { limit, offset, ...filters }));
}));
router.get("/receivables", asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["dueFrom", "dueTo", "status", "personId", "enrollmentId"]);
  res.json(await listReceivables(req.auth!, { limit, offset, ...filters }));
}));
router.get("/payments", asyncHandler(async (req, res) => {
  const { limit, offset, filters } = parseListQuery(req, ["from", "to", "personId", "paymentMethodId"]);
  res.json(await listPayments(req.auth!, { limit, offset, ...filters }));
}));
router.get("/operational-balances", asyncHandler(async (req, res) => res.json(await getOperationalBalances(req.auth!))));
router.get("/sector-settlements", asyncHandler(async (req, res) => res.json(await getSectorSettlements(req.auth!))));

export default router;
