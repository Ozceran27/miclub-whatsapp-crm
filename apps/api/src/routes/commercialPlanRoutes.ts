import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import { requirePermission } from "../middleware/authorization.js";
import { readCommercialPlanCatalog } from "../services/planCommercialCatalog.js";
import asyncHandler from "./asyncHandler.js";
const router=Router();
router.get("/commercial-plans",requirePermission(PERMISSIONS.ONBOARDING_READ),asyncHandler(async(_req,res)=>res.json(await readCommercialPlanCatalog())));
export default router;
