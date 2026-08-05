import { Router } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();

router.use(requireAuth, requireMembership, rejectClientClubId, requirePermission("administration.view"));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
