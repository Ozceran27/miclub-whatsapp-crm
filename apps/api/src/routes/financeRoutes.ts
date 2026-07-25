import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getOperationalBalances, getSectorSettlements, listMovements, listPayments, listReceivables } from "../services/financeService.js";

// productivo: finanzas bajo /api; no renombrar sin migración frontend.
const router = Router();

router.get("/movements", asyncHandler(async (req, res) => res.json(await listMovements(req.auth!))));
router.get("/receivables", asyncHandler(async (req, res) => res.json(await listReceivables(req.auth!))));
router.get("/payments", asyncHandler(async (req, res) => res.json(await listPayments(req.auth!))));
router.get("/operational-balances", asyncHandler(async (req, res) => res.json(await getOperationalBalances(req.auth!))));
router.get("/sector-settlements", asyncHandler(async (req, res) => res.json(await getSectorSettlements(req.auth!))));

export default router;
