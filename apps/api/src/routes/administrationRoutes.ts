import { Router } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import { getAdministrationSummary } from "../services/administration/administrationSummaryService.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();

router.use(requireAuth, requireMembership, rejectClientClubId, requirePermission("administration.view"));

router.get("/summary", asyncHandler(async (req, res) => {
  res.json(await getAdministrationSummary(req.auth!.clubId));
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
