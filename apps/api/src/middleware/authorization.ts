import type { Request, RequestHandler } from "express";

const reject = (status: 401 | 403, message: string): RequestHandler =>
  (_req, res) => res.status(status).json({ message });

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth?.userId) return reject(401, "Autenticación requerida")(req, res, next);
  next();
};

export const requireMembership: RequestHandler = (req, res, next) => {
  if (!req.auth?.clubId || !req.auth.membershipId) {
    return reject(req.auth ? 403 : 401, "Membresía de club requerida")(req, res, next);
  }
  next();
};

export const requirePermission = (...permissions: string[]): RequestHandler => (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!permissions.every((permission) => req.auth!.permissions.includes(permission))) {
    return reject(403, "Permiso insuficiente")(req, res, next);
  }
  next();
};

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  if (!req.auth) return reject(401, "Autenticación requerida")(req, res, next);
  if (!roles.includes(req.auth.role)) return reject(403, "Rol insuficiente")(req, res, next);
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
    if (!sectorId || (!req.auth.permissions.includes("sectors:any") && !req.auth.sectorIds.includes(sectorId))) {
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
