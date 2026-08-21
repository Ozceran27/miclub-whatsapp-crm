import { PERMISSIONS } from "@miclub/shared";
import { Router, type Request } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import { getAdministrationSummary } from "../services/administration/administrationSummaryService.js";
import asyncHandler from "./asyncHandler.js";
import { getAdministrationWorkers } from "../services/administration/workersService.js";
import { parseListQuery } from "./listQuery.js";
import { createSector, listSectorTemplates, type SectorActor } from "../repositories/sectorsRepository.js";
import { archiveWorker, createWorker, updateWorker, WorkerMutationError, type WorkerActor } from "../services/administration/workerMutationService.js";
import { getPostgresPool } from "../db/postgres.js";

const router = Router();

router.use(requireAuth, requireMembership, rejectClientClubId, requirePermission(PERMISSIONS.ADMINISTRATION_VIEW));

router.get("/summary", asyncHandler(async (req, res) => {
  res.json(await getAdministrationSummary(req.auth!.clubId));
}));

router.get("/workers", asyncHandler(async (req, res) => {
  const { limit, offset } = parseListQuery(req, [], { defaultLimit: 50, maxLimit: 100 });
  res.json(await getAdministrationWorkers(req.auth!.clubId, limit, offset));
}));

const workerActor = (req: Request): WorkerActor => ({ userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId, requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent") });
const workerMutation = (operation: (actor: WorkerActor, id: string, body: unknown) => Promise<unknown>) => asyncHandler(async (req, res) => {
  try { res.json(await operation(workerActor(req), String(req.params.id), req.body)); }
  catch (error) { if (!(error instanceof WorkerMutationError)) throw error; const status = error.code === "not_found" ? 404 : error.code === "invalid_input" ? 400 : 409; res.status(status).json({ error: true, code: error.code.toUpperCase(), message: error.message }); }
});
router.post("/workers", requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  try {
    const result = await createWorker(workerActor(req), req.body);
    if (result.invitationPending === true) return res.status(409).json({ error: true, code: "CONFLICT", message: "No se pudo completar el alta." });
    return res.status(201).json(result);
  }
  catch (error) { if (!(error instanceof WorkerMutationError)) throw error; res.status(error.code === "invalid_input" ? 400 : 409).json({ error: true, code: error.code === "invalid_input" ? "INVALID_INPUT" : "CONFLICT", message: error.code === "invalid_input" ? error.message : "No se pudo completar el alta." }); }
}));
router.put("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id, body) => updateWorker(actor, id, body)));
router.delete("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id) => archiveWorker(actor, id)));

router.get("/sector-templates", requirePermission(PERMISSIONS.SECTORS_VIEW), asyncHandler(async (_req, res) => {
  res.json({ items: await listSectorTemplates() });
}));

router.get("/activity-icons", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (_req, res) => {
  const pool = await getPostgresPool();
  const result = await pool.query("select icon_key as \"iconKey\", display_name as \"displayName\" from miclub.activity_icon_catalog order by sort_order, display_name");
  res.json({ items: result.rows });
}));

router.post("/sectors", requirePermission(PERMISSIONS.SECTORS_EDIT), asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const color = typeof body.color === "string" ? body.color.trim().toUpperCase() : "";
  const status = body.status;
  if (typeof body.templateId !== "string" || !uuid.test(body.templateId) || !/^#[0-9A-F]{6}$/.test(color)
    || !["active", "inactive", "under_repair"].includes(String(status))) {
    return res.status(400).json({ error: true, code: "VALIDATION_ERROR", message: "templateId, color hexadecimal y status válidos son obligatorios." });
  }
  const actor: SectorActor = { userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId, requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent") };
  const result = await createSector(actor, { templateId: body.templateId, color, status: status as "active" | "inactive" | "under_repair" });
  if (result.kind === "invalid_template") return res.status(400).json({ error: true, code: "INVALID_TEMPLATE", message: "La plantilla no existe o está inactiva." });
  if (result.kind === "duplicate") return res.status(409).json({ error: true, code: "SECTOR_TEMPLATE_DUPLICATE", message: "El club ya tiene un sector activo con esa plantilla." });
  return res.status(201).json(result.sector);
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
