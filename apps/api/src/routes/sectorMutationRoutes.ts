import { Router, type Request, type Response } from "express";
import { requirePermission, requireSectorAccess } from "../middleware/authorization.js";
import { archiveSector, setSectorStatus, updateSector, type SectorActor, type SectorMutationResult, type SectorUpdate } from "../repositories/sectorsRepository.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const fail = (res: Response, status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ ok: false, error: true, status, code, message, details });

const actor = (req: Request): SectorActor => ({
  userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId,
  requestId: req.requestId, ip: req.ip, userAgent: req.get("user-agent"),
});

const expectedVersion = (body: Record<string, unknown>, res: Response): string | null => {
  if (typeof body.updatedAt !== "string" || !ISO_DATE.test(body.updatedAt) || !Number.isFinite(Date.parse(body.updatedAt))) {
    fail(res, 400, "VALIDATION_ERROR", "updatedAt debe ser una fecha ISO UTC y es obligatorio para controlar concurrencia.");
    return null;
  }
  return body.updatedAt;
};

const respond = (res: Response, result: SectorMutationResult) => {
  if (result.kind === "updated") return res.json(result.sector);
  if (result.kind === "missing") return fail(res, 404, "SECTOR_NOT_FOUND", "Sector no encontrado.");
  if (result.kind === "conflict") return fail(res, 409, "OPTIMISTIC_CONCURRENCY_CONFLICT", "El sector fue modificado por otra operación; recargue los datos.");
  if (result.kind === "protected") return fail(res, 409, "SYSTEM_SECTOR_PROTECTED", "El sector de sistema no puede renombrarse, archivarse ni cambiar de estado.");
  if (result.kind === "invalid_manager") return fail(res, 400, "INVALID_MANAGER", "El responsable no pertenece al club.");
  return fail(res, 409, "SECTOR_HAS_DEPENDENCIES", "El sector tiene dependencias y no puede archivarse.", result.dependencies);
};

router.patch("/sectors/:id", requirePermission("sectors.edit"), requireSectorAccess((req) => req.params.id), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id de sector inválido.");
  const body = req.body as Record<string, unknown>;
  const version = expectedVersion(body, res);
  if (!version) return;
  const allowed = new Set(["updatedAt", "name", "description", "icon", "color", "managerPersonId", "capacityMode", "configuredCapacity"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return fail(res, 400, "VALIDATION_ERROR", "La solicitud contiene campos no editables.");
  if (typeof body.name !== "string" || !body.name.trim()) return fail(res, 400, "VALIDATION_ERROR", "name es obligatorio.");
  for (const field of ["description", "icon", "color"] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== "string") return fail(res, 400, "VALIDATION_ERROR", `${field} debe ser texto.`);
  }
  if (body.managerPersonId !== undefined && body.managerPersonId !== null && (typeof body.managerPersonId !== "string" || !UUID.test(body.managerPersonId))) return fail(res, 400, "VALIDATION_ERROR", "managerPersonId inválido.");
  if (body.capacityMode !== undefined && !["none", "fixed", "unlimited"].includes(String(body.capacityMode))) return fail(res, 400, "VALIDATION_ERROR", "capacityMode inválido.");
  if (body.configuredCapacity !== undefined && body.configuredCapacity !== null && (!Number.isInteger(body.configuredCapacity) || Number(body.configuredCapacity) < 0)) return fail(res, 400, "VALIDATION_ERROR", "configuredCapacity debe ser un entero no negativo.");
  const input = { ...body, name: body.name.trim() } as SectorUpdate;
  delete (input as Record<string, unknown>).updatedAt;
  return respond(res, await updateSector(actor(req), id, version, input));
}));

router.post("/sectors/:id/archive", requirePermission("sectors.archive"), requireSectorAccess((req) => req.params.id), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id de sector inválido.");
  const body = req.body as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "updatedAt")) return fail(res, 400, "VALIDATION_ERROR", "La solicitud contiene campos no permitidos.");
  const version = expectedVersion(body, res);
  if (version) return respond(res, await archiveSector(actor(req), id, version));
}));

router.patch("/sectors/:id/status", requirePermission("sectors.edit"), requireSectorAccess((req) => req.params.id), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return fail(res, 400, "VALIDATION_ERROR", "id de sector inválido.");
  const body = req.body as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["updatedAt", "status"].includes(key))) return fail(res, 400, "VALIDATION_ERROR", "La solicitud contiene campos no permitidos.");
  const version = expectedVersion(body, res);
  if (!version) return;
  if (body.status !== "active" && body.status !== "inactive") return fail(res, 400, "VALIDATION_ERROR", "status debe ser active o inactive.");
  return respond(res, await setSectorStatus(actor(req), id, version, body.status));
}));

export default router;
