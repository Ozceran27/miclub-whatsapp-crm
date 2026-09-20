import { PERMISSIONS } from "@miclub/shared";
import { Router, type Request } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import { getAdministrationSummary } from "../services/administration/administrationSummaryService.js";
import asyncHandler from "./asyncHandler.js";
import { getAdministrationWorkers } from "../services/administration/workersService.js";
import { parseListQuery } from "./listQuery.js";
import { createSector, type SectorActor } from "../repositories/sectorsRepository.js";
import { archiveWorker, createWorker, updateWorker, WorkerMutationError, type WorkerActor } from "../services/administration/workerMutationService.js";
import { getPostgresPool } from "../db/postgres.js";
import { tenantExecutor } from "../db/transaction.js";
import { deleteEmployeePhoto } from "../services/onboardingPhotoStore.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (result.invitationPending === true) return res.status(202).json({ invitationPending: true, message: "La invitación quedó pendiente de aceptación por la cuenta existente." });
    return res.status(201).json(result);
  }
  catch (error) { if (!(error instanceof WorkerMutationError)) throw error; res.status(error.code === "invalid_input" ? 400 : 409).json({ error: true, code: error.code === "invalid_input" ? "INVALID_INPUT" : "CONFLICT", message: error.code === "invalid_input" ? error.message : "No se pudo completar el alta." }); }
}));
router.put("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id, body) => updateWorker(actor, id, body)));
router.delete("/workers/:id/photo", requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const id=String(req.params.id);
  if(!UUID.test(id)) return res.status(400).json({error:true,code:"VALIDATION_ERROR",message:"id de trabajador inválido."});
  res.json(await deleteEmployeePhoto(req.auth!.clubId, id));
}));
router.delete("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id) => archiveWorker(actor, id)));

router.get("/activity-icons", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (_req, res) => {
  const pool = await getPostgresPool();
  const result = await pool.query("select icon_key as \"iconKey\", display_name as \"displayName\" from miclub.activity_icon_catalog order by sort_order, display_name");
  res.json({ items: result.rows });
}));

router.get("/activity-instructors", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (req, res) => {
  const result = await tenantExecutor(req.auth!.clubId).query(`select id, person_id as "personId", display_name as "displayName", true as "isActive"
    from miclub.instructors where club_id=$1 and status='activa' order by display_name, id`, [req.auth!.clubId]);
  res.json({ items: result.rows });
}));

router.get("/activities/:id/terms", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (req, res) => {
  const id=String(req.params.id);
  if(!UUID.test(id)) return res.status(400).json({error:true,code:"VALIDATION_ERROR",message:"id de actividad inválido."});
  const sectors=req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY)?null:req.auth!.sectorIds;
  const result=await tenantExecutor(req.auth!.clubId).query(`select t.id,t.mode,t.fixed_club_fee::float8 "fixedClubFee",t.fixed_fee_frequency "fixedFeeFrequency",t.club_share_percentage::float8 "clubSharePercentage",t.currency_code "currencyCode",t.effective_from::text "effectiveFrom",t.effective_to::text "effectiveTo",t.responsible_person_id "responsiblePersonId",concat_ws(' ',p.first_name,p.last_name) "responsiblePersonName",t.revision
    from miclub.activity_terms t join miclub.activities a on a.id=t.activity_id and a.club_id=t.club_id
    left join miclub.people p on p.id=t.responsible_person_id and p.club_id=t.club_id
    where t.club_id=$1 and t.activity_id=$2 and ($3::uuid[] is null or a.sector_id=any($3)) order by t.effective_from desc,t.id`,[req.auth!.clubId,id,sectors]);
  res.json({items:result.rows});
}));

router.post("/sectors", requirePermission(PERMISSIONS.SECTORS_CREATE), asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const color = typeof body.color === "string" ? body.color.trim().toUpperCase() : "";
  const status = body.status;
  if (body.templateId !== undefined || body.source === "template")
    return res.status(400).json({ error: true, code: "SECTOR_TEMPLATES_DISABLED", message: "La creación de sectores desde plantillas no está disponible." });
  if (!/^#[0-9A-F]{6}$/.test(color) || !["active", "inactive", "under_repair"].includes(String(status)))
    return res.status(400).json({ error: true, code: "VALIDATION_ERROR", message: "color hexadecimal y status válidos son obligatorios." });
  const actor: SectorActor = { userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId, requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent") };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const iconKey = typeof body.iconKey === "string" ? body.iconKey.trim() : "";
  const capacityMode = body.capacityMode === "ENROLLMENTS" ? "ENROLLMENTS" : "INCOME";
  const configuredCapacity = capacityMode === "ENROLLMENTS" ? Number(body.configuredCapacity) : null;
  if (!name || !iconKey || (capacityMode === "ENROLLMENTS" && (!Number.isSafeInteger(configuredCapacity) || Number(configuredCapacity) < 1))) return res.status(400).json({ error: true, code: "VALIDATION_ERROR", message: "Nombre, icono y capacidad válidos son obligatorios para un sector personalizado." });
  const input: Parameters<typeof createSector>[1] = { name, code: typeof body.code === "string" ? body.code : null, description: typeof body.description === "string" ? body.description.trim() || null : null, iconKey, color, status: status as "active" | "inactive" | "under_repair", capacityMode, configuredCapacity };
  const result = await createSector(actor, input);
  return res.status(201).json(result.sector);
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
