import type express from "express";
import type { AuthenticatedContext, RequestAuthContext } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuthContext;
    }
  }
}

const authContextKey = Symbol("authContext");
type AuthenticatedRequest = express.Request & { [authContextKey]?: AuthenticatedContext };

export const setAuthenticatedContext = (request: express.Request, context: AuthenticatedContext): void => {
  (request as AuthenticatedRequest)[authContextKey] = context;
  if (context.userId && context.clubId && context.membershipId && context.role) {
    request.auth = {
      userId: context.userId,
      email: context.email,
      legacy: context.legacy,
      clubId: context.clubId,
      membershipId: context.membershipId,
      role: context.role,
      permissions: context.permissions ?? [],
      sectorIds: context.sectorIds ?? []
    };
  }
};

export const getAuthenticatedContext = (request: express.Request): AuthenticatedContext | null =>
  (request as AuthenticatedRequest)[authContextKey] ?? null;

export const requireAuthenticatedContext = (request: express.Request): AuthenticatedContext => {
  const context = getAuthenticatedContext(request);
  if (!context) throw new Error("No hay un contexto autenticado en la solicitud.");
  return context;
};
