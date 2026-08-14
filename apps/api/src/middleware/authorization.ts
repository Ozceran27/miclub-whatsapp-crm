import { hasAuthorizationCapability, PERMISSIONS, type AuthorizationCapability, type ClubCapabilityCode, type PermissionCode } from "@miclub/shared";
import type { Request, RequestHandler } from "express";
import type { AuthenticatedContext } from "../auth/types.js";
import { hasFeature } from "../services/clubCapabilityService.js";

const reject = (status: 401 | 403, message: string, code = status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN"): RequestHandler =>
  (_req, res) => res.status(status).json({ code, message });

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth?.userId) return reject(401, "Autenticación requerida")(req, res, next);
  next();
};

export const requireMembership: RequestHandler = (req, res, next) => {
  if (!req.auth?.clubId || !req.auth.membershipId) {
    return reject(req.auth ? 403 : 401, "Membresía de club requerida", req.auth ? "TENANT_CONTEXT_REQUIRED" : "AUTHENTICATION_REQUIRED")(req, res, next);
  }
  next();
};

export const requirePermission = (...permissions: PermissionCode[]): RequestHandler => (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!permissions.every((permission) => req.auth!.permissions.includes(permission))) {
    return reject(403, "Permiso insuficiente")(req, res, next);
  }
  next();
};

export const requireClubCapability = (capability: ClubCapabilityCode): RequestHandler => async (req, res, next) => {
  if (!req.auth?.clubId) return reject(req.auth ? 403 : 401, "Membresía de club requerida")(req, res, next);
  try {
    if (!await hasFeature(req.auth.clubId, capability)) {
      return reject(403, "Funcionalidad no habilitada para este club", "CAPABILITY_REQUIRED")(req, res, next);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Temporary, centralized compatibility guard for a granular operation. It
 * accepts its canonical permission or the legacy equivalent declared in the
 * shared matrix. See LEGACY_PERMISSION_COMPATIBILITY_ENDS_ON in shared/auth.
 */
export const requireAuthorizationCapability = (capability: AuthorizationCapability): RequestHandler => (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!hasAuthorizationCapability(req.auth.permissions, capability)) {
    return reject(403, "Permiso insuficiente")(req, res, next);
  }
  next();
};

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!roles.includes(req.auth.role)) return reject(403, "Rol insuficiente")(req, res, next);
  next();
};

const normalizeIdentity = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

/**
 * El permiso tenant es la fuente de verdad para mostrar y operar el panel.
 * IMPORT_OPERATOR_USER es una restricción adicional opcional para instalaciones
 * que quieran limitar las migraciones a una única identidad.
 */
export const isImportOperator = (
  auth: Partial<Pick<AuthenticatedContext, "email" | "userId" | "membershipId" | "permissions">> | undefined,
): boolean => {
  const configuredUser = normalizeIdentity(process.env.IMPORT_OPERATOR_USER);
  const hasTenantPermission = Boolean(
    auth?.userId
    && auth.membershipId
    && auth.permissions?.includes(PERMISSIONS.IMPORTS_RUN),
  );
  return hasTenantPermission && (!configuredUser || normalizeIdentity(auth?.email) === configuredUser);
};

export const requireImportOperator: RequestHandler = (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!isImportOperator(req.auth)) return reject(403, "Panel de migración reservado al operador autorizado")(req, res, next);
  next();
};

/**
 * Limita una operación al sector indicado por la ruta/body. Los roles con el
 * permiso `sectors:any` pueden operar sobre cualquier sector del mismo club.
 */
export const requireSectorAccess = (getSectorId: (req: Request) => unknown = (req) => req.params.sectorId): RequestHandler =>
  (req, res, next) => {
    if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
    const value = getSectorId(req);
    const sectorId = typeof value === "string" ? value : "";
    if (!sectorId || (!req.auth.permissions.includes(PERMISSIONS.SECTORS_ANY) && !req.auth.sectorIds.includes(sectorId))) {
      return reject(403, "Acceso al sector denegado")(req, res, next);
    }
    next();
  };

/** Rechaza intentos de elegir el tenant desde parámetros controlados por el cliente. */
export const rejectClientClubId: RequestHandler = (req, res, next) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (req.params.clubId !== undefined || req.query.clubId !== undefined || body?.clubId !== undefined) {
    return res.status(400).json({ message: "clubId se obtiene de la sesión y no puede enviarse en la solicitud" });
  }
  next();
};
