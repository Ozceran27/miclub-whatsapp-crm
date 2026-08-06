import { PERMISSIONS } from "@miclub/shared";
import { Router, type Request, type Response } from "express";
import { requirePermission, requireSectorAccess } from "../middleware/authorization.js";
import { archiveActivity, createActivity, setActivityStatus, updateActivity, type ActivityActor, type ActivityInput, type ActivityMutationResult } from "../repositories/activitiesRepository.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const fail = (res: Response, status: number, code: string, message: string, details?: unknown) => res.status(status).json({ ok: false, error: true, status, code, message, details });
const actor = (req: Request): ActivityActor => ({
  userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId,
  sectorIds: req.auth!.sectorIds, canAccessAnySector: req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY),
  requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent"),
});

const version = (body: Record<string, unknown>, res: Response): string | null => {
  if (typeof body.updatedAt !== "string" || !ISO_DATE.test(body.updatedAt) || !Number.isFinite(Date.parse(body.updatedAt))) {
    fail(res, 400, "VALIDATION_ERROR", "updatedAt debe ser una fecha ISO UTC y es obligatorio para controlar concurrencia."); return null;
  }
  return body.updatedAt;
};

const parseInput = (body: Record<string, unknown>, res: Response): ActivityInput | null => {
  const allowed = new Set(["updatedAt", "sectorId", "managerPersonId", "instructorId", "code", "name", "modality", "color", "monthlyFee", "clubCommissionPercent", "instructorCommissionPercent", "maxCapacity", "status", "notes"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) { fail(res, 400, "VALIDATION_ERROR", "La solicitud contiene campos no editables."); return null; }
  if (typeof body.sectorId !== "string" || !UUID.test(body.sectorId) || typeof body.name !== "string" || !body.name.trim()) { fail(res, 400, "VALIDATION_ERROR", "sectorId y name son obligatorios."); return null; }
  for (const field of ["managerPersonId", "instructorId"] as const) if (body[field] !== undefined && body[field] !== null && (typeof body[field] !== "string" || !UUID.test(body[field]))) { fail(res, 400, "VALIDATION_ERROR", `${field} debe ser UUID o null.`); return null; }
  for (const field of ["monthlyFee", "instructorCommissionPercent"] as const) if (body[field] !== undefined && (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0)) { fail(res, 400, "VALIDATION_ERROR", `${field} debe ser un número no negativo.`); return null; }
  if (typeof body.clubCommissionPercent !== "number" || !Number.isFinite(body.clubCommissionPercent) || body.clubCommissionPercent < 0 || body.clubCommissionPercent > 100) { fail(res, 400, "VALIDATION_ERROR", "clubCommissionPercent debe estar entre 0 y 100."); return null; }
  if (body.maxCapacity !== undefined && body.maxCapacity !== null && (!Number.isInteger(body.maxCapacity) || Number(body.maxCapacity) < 0)) { fail(res, 400, "VALIDATION_ERROR", "maxCapacity debe ser entero no negativo."); return null; }
  if (body.status !== undefined && !["active", "inactive"].includes(String(body.status))) { fail(res, 400, "VALIDATION_ERROR", "status debe ser active o inactive."); return null; }
  if ((body.status ?? "inactive") === "active" && (typeof body.managerPersonId !== "string" || !UUID.test(body.managerPersonId))) { fail(res, 400, "ACTIVE_ACTIVITY_REQUIRES_MANAGER", "Una actividad activa requiere responsable principal."); return null; }
  return { ...body, managerPersonId: body.managerPersonId ?? null, name: body.name.trim() } as ActivityInput;
};

const respond = (res: Response, result: ActivityMutationResult) => {
  if (result.kind === "created") return res.status(201).json(result.activity);
  if (result.kind === "updated") return res.json(result.activity);
  const errors: Record<string, [number, string, string]> = {
    missing: [404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada."], conflict: [409, "OPTIMISTIC_CONCURRENCY_CONFLICT", "La actividad fue modificada por otra operación; recargue los datos."],
    model_not_applied: [503, "ACTIVITY_MODEL_NOT_APPLIED", "El modelo de mutaciones de actividades todavía no fue aplicado."], invalid_manager: [400, "INVALID_MANAGER", "Una actividad activa requiere un responsable principal válido del club."],
    invalid_sector: [400, "INVALID_SECTOR", "El sector no pertenece al club o está archivado."], invalid_instructor: [400, "INVALID_INSTRUCTOR", "El instructor no pertenece al club."],
    dependencies: [409, "ACTIVITY_HAS_DEPENDENCIES", "La actividad tiene dependencias y no existe una regla segura para archivarla."],
  };
  const [status, code, message] = errors[result.kind]; return fail(res, status, code, message, "dependencies" in result ? result.dependencies : undefined);
};

router.post("/activities", requirePermission(PERMISSIONS.ACTIVITIES_CREATE), requireSectorAccess((req) => req.body?.sectorId), asyncHandler(async (req, res) => { const input = parseInput(req.body, res); if (input) return respond(res, await createActivity(actor(req), input)); }));
router.patch("/activities/:id", requirePermission(PERMISSIONS.ACTIVITIES_EDIT), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); const expected = version(req.body, res); const input = parseInput(req.body, res); if (expected && input) return respond(res, await updateActivity(actor(req), id, expected, input)); }));
router.patch("/activities/:id/status", requirePermission(PERMISSIONS.ACTIVITIES_EDIT), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); if (Object.keys(req.body).some((key) => !["updatedAt", "status"].includes(key)) || !["active", "inactive"].includes(req.body.status)) return fail(res, 400, "VALIDATION_ERROR", "status debe ser active o inactive."); const expected = version(req.body, res); if (expected) return respond(res, await setActivityStatus(actor(req), id, expected, req.body.status)); }));
router.post("/activities/:id/archive", requirePermission(PERMISSIONS.ACTIVITIES_ARCHIVE), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); if (Object.keys(req.body).some((key) => key !== "updatedAt")) return fail(res, 400, "VALIDATION_ERROR", "Campos no permitidos."); const expected = version(req.body, res); if (expected) return respond(res, await archiveActivity(actor(req), id, expected)); }));

export default router;
