import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getOperationalBalances, getSectorSettlements, listMovements, listPayments, listReceivables } from "../services/financeService.js";

const router = Router();

router.get("/movements", asyncHandler(async (_req, res) => res.json(await listMovements())));
router.get("/receivables", asyncHandler(async (_req, res) => res.json(await listReceivables())));
router.get("/payments", asyncHandler(async (_req, res) => res.json(await listPayments())));
router.get("/operational-balances", asyncHandler(async (_req, res) => res.json(await getOperationalBalances())));
router.get("/sector-settlements", asyncHandler(async (_req, res) => res.json(await getSectorSettlements())));

export default router;
