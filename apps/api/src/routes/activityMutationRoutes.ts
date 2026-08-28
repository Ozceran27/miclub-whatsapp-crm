import { PERMISSIONS, type ActivityMutationContract } from "@miclub/shared";
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
  const allowed = new Set(["updatedAt", "sectorId", "instructorId", "code", "name", "modality", "color", "iconKey", "instructorCommissionPercent", "maxCapacity", "status", "notes", "settlement"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) { fail(res, 400, "VALIDATION_ERROR", "La solicitud contiene campos no editables."); return null; }
  if (typeof body.sectorId !== "string" || !UUID.test(body.sectorId) || typeof body.name !== "string" || !body.name.trim()) { fail(res, 400, "VALIDATION_ERROR", "sectorId y name son obligatorios."); return null; }
  if (body.instructorId !== undefined && body.instructorId !== null && (typeof body.instructorId !== "string" || !UUID.test(body.instructorId))) { fail(res, 400, "VALIDATION_ERROR", "instructorId debe ser UUID o null."); return null; }
  if (body.instructorCommissionPercent !== undefined && (typeof body.instructorCommissionPercent !== "number" || !Number.isFinite(body.instructorCommissionPercent) || body.instructorCommissionPercent < 0)) { fail(res, 400, "VALIDATION_ERROR", "instructorCommissionPercent debe ser un número no negativo."); return null; }
  const settlement = body.settlement as Record<string, unknown> | undefined;
  if (!settlement) { fail(res, 400, "VALIDATION_ERROR", "settlement es obligatorio."); return null; }
  const keys = Object.keys(settlement); const mode = settlement.mode;
  const parsedEffectiveFrom = typeof settlement.effectiveFrom === "string" ? new Date(`${settlement.effectiveFrom}T00:00:00Z`) : null;
  const effectiveFromValid = typeof settlement.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(settlement.effectiveFrom)
    && !Number.isNaN(parsedEffectiveFrom?.getTime()) && parsedEffectiveFrom?.toISOString().slice(0, 10) === settlement.effectiveFrom;
  const fixedValid = mode === "FIXED" && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(settlement.fixedFeeFrequency)) && typeof settlement.fixedClubFee === "number" && Number.isFinite(settlement.fixedClubFee) && settlement.fixedClubFee >= 0 && ["ARS","USD","BRL","EUR"].includes(String(settlement.currencyCode)) && settlement.clubSharePercentage === null;
  const variableValid = mode === "VARIABLE" && settlement.fixedFeeFrequency === null && settlement.fixedClubFee === null && settlement.currencyCode === null && typeof settlement.clubSharePercentage === "number" && Number.isFinite(settlement.clubSharePercentage) && settlement.clubSharePercentage >= 0 && settlement.clubSharePercentage <= 100;
  if (keys.some((key) => !["mode", "fixedClubFee", "fixedFeeFrequency", "currencyCode", "clubSharePercentage", "effectiveFrom"].includes(key)) || !effectiveFromValid || (!fixedValid && !variableValid)) { fail(res, 400, "VALIDATION_ERROR", "La liquidación FIXED o VARIABLE no es válida."); return null; }
  if (body.maxCapacity !== undefined && body.maxCapacity !== null && (!Number.isInteger(body.maxCapacity) || Number(body.maxCapacity) < 0)) { fail(res, 400, "VALIDATION_ERROR", "maxCapacity debe ser entero no negativo."); return null; }
  if (body.status !== undefined && !["active", "inactive"].includes(String(body.status))) { fail(res, 400, "VALIDATION_ERROR", "status debe ser active o inactive."); return null; }
  if ((body.status ?? "inactive") === "active" && (typeof body.instructorId !== "string" || !UUID.test(body.instructorId))) { fail(res, 400, "ACTIVE_ACTIVITY_REQUIRES_INSTRUCTOR", "Una actividad activa requiere instructor responsable."); return null; }
  const contract = body as unknown as ActivityMutationContract;
  return { ...contract, managerPersonId: null, clubCommissionPercent: settlement.mode === "VARIABLE" ? settlement.clubSharePercentage as number : 0, name: body.name.trim() } as ActivityInput;
};

const respond = (res: Response, result: ActivityMutationResult) => {
  if (result.kind === "created") return res.status(201).json(result.activity);
  if (result.kind === "updated") return res.json(result.activity);
  const errors: Record<string, [number, string, string]> = {
    missing: [404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada."], conflict: [409, "OPTIMISTIC_CONCURRENCY_CONFLICT", "La actividad fue modificada por otra operación; recargue los datos."],
    model_not_applied: [503, "ACTIVITY_MODEL_NOT_APPLIED", "El modelo de mutaciones de actividades todavía no fue aplicado."], invalid_manager: [404, "INVALID_MANAGER", "El responsable no fue encontrado."],
    invalid_sector: [404, "INVALID_SECTOR", "El sector no fue encontrado."], invalid_instructor: [404, "INVALID_INSTRUCTOR", "El instructor no fue encontrado."],
    dependencies: [409, "ACTIVITY_HAS_DEPENDENCIES", "La actividad tiene dependencias y no existe una regla segura para archivarla."],
    invalid_terms: [409, "INVALID_ACTIVITY_TERMS", "La nueva vigencia solapa o deja un hueco en las condiciones económicas."],
    settled_history: [409, "SETTLED_ACTIVITY_TERMS", "No se puede alterar historia económica ya liquidada."],
  };
  const [status, code, message] = errors[result.kind]; return fail(res, status, code, message, "dependencies" in result ? result.dependencies : undefined);
};

router.post("/activities", requirePermission(PERMISSIONS.ACTIVITIES_CREATE), requireSectorAccess((req) => req.body?.sectorId), asyncHandler(async (req, res) => { const input = parseInput(req.body, res); if (input) return respond(res, await createActivity(actor(req), input)); }));
router.patch("/activities/:id", requirePermission(PERMISSIONS.ACTIVITIES_EDIT), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); const expected = version(req.body, res); const input = parseInput(req.body, res); if (expected && input) return respond(res, await updateActivity(actor(req), id, expected, input)); }));
router.patch("/activities/:id/status", requirePermission(PERMISSIONS.ACTIVITIES_EDIT), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); if (Object.keys(req.body).some((key) => !["updatedAt", "status"].includes(key)) || !["active", "inactive"].includes(req.body.status)) return fail(res, 400, "VALIDATION_ERROR", "status debe ser active o inactive."); const expected = version(req.body, res); if (expected) return respond(res, await setActivityStatus(actor(req), id, expected, req.body.status)); }));
router.post("/activities/:id/archive", requirePermission(PERMISSIONS.ACTIVITIES_ARCHIVE), asyncHandler(async (req, res) => { const id = String(req.params.id); if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id inválido."); if (Object.keys(req.body).some((key) => key !== "updatedAt")) return fail(res, 400, "VALIDATION_ERROR", "Campos no permitidos."); const expected = version(req.body, res); if (expected) return respond(res, await archiveActivity(actor(req), id, expected)); }));

export default router;
