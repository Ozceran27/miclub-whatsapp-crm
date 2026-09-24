import { PERMISSIONS } from "@miclub/shared";
import { Router, type Request } from "express";
import { rejectClientClubId, requireAuth, requireMembership, requirePermission } from "../middleware/authorization.js";
import { getAdministrationInitialReadModel } from "../services/administration/administrationReadService.js";
import { getAdministrationSummary } from "../services/administration/administrationSummaryService.js";
import asyncHandler from "./asyncHandler.js";
import { getAdministrationWorkers } from "../services/administration/workersService.js";
import { getAdministrationWorkerBalances } from "../services/administration/workerBalancesService.js";
import { parseListQuery } from "./listQuery.js";
import { createSector, listSectorManagerCandidates, type SectorActor } from "../repositories/sectorsRepository.js";
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
router.get("/club-currency", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async(req,res)=>{
  const row=(await tenantExecutor(req.auth!.clubId).query<{base_currency_code:string}>("select base_currency_code from miclub.clubs where id=$1",[req.auth!.clubId])).rows[0];
  res.json({currencyCode:row?.base_currency_code??null});
}));

router.get("/workers", requirePermission(PERMISSIONS.WORKERS_VIEW), asyncHandler(async (req, res) => {
  const { limit, offset } = parseListQuery(req, [], { defaultLimit: 50, maxLimit: 100 });
  res.json(await getAdministrationWorkers(req.auth!.clubId, limit, offset));
}));

const workerActor = (req: Request): WorkerActor => ({ userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId, requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent") });
const workerErrorResponse = (error: WorkerMutationError) => ({
  status: error.code === "not_found" ? 404 : error.code === "invalid_input" ? 400 : error.code === "model_not_applied" ? 503 : 409,
  code: error.code === "concurrency_conflict" ? "OPTIMISTIC_CONCURRENCY_CONFLICT" : error.code === "model_not_applied" ? "WORKER_MODEL_NOT_APPLIED" : error.code.toUpperCase(),
});
const workerMutation = (operation: (actor: WorkerActor, id: string, body: unknown) => Promise<unknown>) => asyncHandler(async (req, res) => {
  try { res.json(await operation(workerActor(req), String(req.params.id), req.body)); }
  catch (error) { if (!(error instanceof WorkerMutationError)) throw error; const response=workerErrorResponse(error); res.status(response.status).json({ error: true, code: response.code, message: error.message }); }
});
router.post("/workers", requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  try {
    const result = await createWorker(workerActor(req), req.body);
    if (result.invitationPending === true) return res.status(202).json({ invitationPending: true, message: "La invitación quedó pendiente de aceptación por la cuenta existente." });
    return res.status(201).json(result);
  }
  catch (error) { if (!(error instanceof WorkerMutationError)) throw error; const response=workerErrorResponse(error); res.status(response.status).json({ error: true, code: response.code, message: error.code === "invalid_input" || error.code === "model_not_applied" ? error.message : "No se pudo completar el alta." }); }
}));
router.put("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id, body) => updateWorker(actor, id, body)));
router.delete("/workers/:id/photo", requirePermission(PERMISSIONS.WORKERS_MANAGE), asyncHandler(async (req, res) => {
  const id=String(req.params.id);
  if(!UUID.test(id)) return res.status(400).json({error:true,code:"VALIDATION_ERROR",message:"id de trabajador inválido."});
  res.json(await deleteEmployeePhoto(req.auth!.clubId, id));
}));

router.get("/activity-workers", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (req, res) => {
  const result = await tenantExecutor(req.auth!.clubId).query<{ id: string; personId: string; displayName: string; role: string | null }>(`
    select e.id::text, e.person_id::text as "personId",
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Sin nombre') as "displayName",
      e.position::text as role
    from miclub.employees e
    join miclub.people p on p.id=e.person_id and p.club_id=e.club_id
    where e.club_id=$1 and e.status='active' and e.archived_at is null
    order by p.last_name,p.first_name,e.id
  `, [req.auth!.clubId]);
  res.json({ items: result.rows });
}));

router.get("/activity-sectors", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async (req, res) => {
  const visibleSectors = req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds;
  const result = await tenantExecutor(req.auth!.clubId).query<{ id: string; name: string; status: string }>(`
    select s.id::text,s.name,s.status::text
    from miclub.sectors s
    where s.club_id=$1 and s.archived_at is null and s.status='active'
      and ($2::uuid[] is null or s.id=any($2))
    order by s.name,s.id
  `, [req.auth!.clubId, visibleSectors]);
  res.json({ items: result.rows });
}));
router.get("/sector-manager-candidates", asyncHandler(async (req, res) => {
  res.json({ items: await listSectorManagerCandidates(req.auth!.clubId) });
}));

router.get("/workers/balances", requirePermission(PERMISSIONS.WORKERS_VIEW), requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  const { limit, offset } = parseListQuery(req, [], { defaultLimit: 50, maxLimit: 100 });
  res.set('Cache-Control', 'private, no-store');
  res.json(await getAdministrationWorkerBalances(req.auth!, limit, offset));
}));
router.delete("/workers/:id", requirePermission(PERMISSIONS.WORKERS_MANAGE), workerMutation((actor, id, body) => archiveWorker(actor, id, body)));

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
  const result=await tenantExecutor(req.auth!.clubId).query(`select t.id,t.mode,t.fixed_club_fee::float8 "fixedClubFee",t.fixed_fee_frequency "fixedFeeFrequency",t.club_share_percentage::float8 "clubSharePercentage",t.currency_code "currencyCode",t.effective_from::text "effectiveFrom",t.effective_to::text "effectiveTo",t.responsible_person_id "responsiblePersonId",concat_ws(' ',p.first_name,p.last_name) "responsiblePersonName",t.revision,
    case when t.effective_from>(now() at time zone coalesce(nullif(trim(c.timezone),''),'America/Argentina/Buenos_Aires'))::date then 'FUTURE' when (now() at time zone coalesce(nullif(trim(c.timezone),''),'America/Argentina/Buenos_Aires'))::date between t.effective_from and coalesce(t.effective_to,'infinity'::date) then 'CURRENT' else 'HISTORICAL' end phase
    from miclub.activity_terms t join miclub.activities a on a.id=t.activity_id and a.club_id=t.club_id
    join miclub.clubs c on c.id=t.club_id
    left join miclub.people p on p.id=t.responsible_person_id and p.club_id=t.club_id
    where t.club_id=$1 and t.activity_id=$2 and ($3::uuid[] is null or a.sector_id=any($3)) order by t.effective_from desc,t.id`,[req.auth!.clubId,id,sectors]);
  res.json({items:result.rows});
}));

router.get("/activities/:id/prices", requirePermission(PERMISSIONS.ACTIVITIES_VIEW), asyncHandler(async(req,res)=>{
  const id=String(req.params.id);
  if(!UUID.test(id)) return res.status(400).json({error:true,code:"VALIDATION_ERROR",message:"id de actividad inválido."});
  const sectors=req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY)?null:req.auth!.sectorIds;
  const result=await tenantExecutor(req.auth!.clubId).query(`select p.id,p.enrollment_price::float8 "enrollmentPrice",p.fee_price::float8 "feePrice",
    p.fee_frequency "feeFrequency",p.currency_code "currencyCode",p.effective_from::text "effectiveFrom",p.effective_to::text "effectiveTo",p.cancelled_at "cancelledAt"
    from miclub.activity_price_terms p join miclub.activities a on a.id=p.activity_id and a.club_id=p.club_id
    where p.club_id=$1 and p.activity_id=$2 and ($3::uuid[] is null or a.sector_id=any($3))
    order by p.effective_from desc,p.id`,[req.auth!.clubId,id,sectors]);
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
  const managerPersonId = body.managerPersonId === undefined || body.managerPersonId === null || body.managerPersonId === "" ? null : body.managerPersonId;
  if (managerPersonId !== null && (typeof managerPersonId !== "string" || !UUID.test(managerPersonId)))
    return res.status(400).json({ error: true, code: "VALIDATION_ERROR", message: "managerPersonId inválido." });
  if (!name || !iconKey || (capacityMode === "ENROLLMENTS" && (!Number.isSafeInteger(configuredCapacity) || Number(configuredCapacity) < 1))) return res.status(400).json({ error: true, code: "VALIDATION_ERROR", message: "Nombre, icono y capacidad válidos son obligatorios para un sector personalizado." });
  const input: Parameters<typeof createSector>[1] = { name, code: typeof body.code === "string" ? body.code : null, description: typeof body.description === "string" ? body.description.trim() || null : null, iconKey, color, managerPersonId, status: status as "active" | "inactive" | "under_repair", capacityMode, configuredCapacity };
  const result = await createSector(actor, input);
  if (result.kind === "invalid_manager") return res.status(400).json({ error: true, code: "INVALID_MANAGER", message: "El responsable no pertenece al club o no está activo." });
  return res.status(201).json(result.sector);
}));

router.get("/", requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  res.json(await getAdministrationInitialReadModel(req.auth!.clubId));
}));

export default router;
