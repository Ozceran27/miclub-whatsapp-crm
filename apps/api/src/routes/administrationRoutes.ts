import { Router } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import { getAdministrationSummary } from "../services/administration/administrationSummaryService.js";
import asyncHandler from "./asyncHandler.js";
import { getAdministrationWorkers } from "../services/administration/workersService.js";
import { parseListQuery } from "./listQuery.js";

const router = Router();

router.use(requireAuth, requireMembership, rejectClientClubId, requirePermission("administration.view"));

router.get("/summary", asyncHandler(async (req, res) => {
  res.json(await getAdministrationSummary(req.auth!.clubId));
}));

router.get("/workers", asyncHandler(async (req, res) => {
  const { limit, offset } = parseListQuery(req, [], { defaultLimit: 50, maxLimit: 100 });
  res.json(await getAdministrationWorkers(req.auth!.clubId, limit, offset));
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
