import type express from "express";
import type { AuthenticatedContext } from "./types.js";

const authContextKey = Symbol("authContext");
type AuthenticatedRequest = express.Request & { [authContextKey]?: AuthenticatedContext };

export const setAuthenticatedContext = (request: express.Request, context: AuthenticatedContext): void => {
  (request as AuthenticatedRequest)[authContextKey] = context;
};

export const getAuthenticatedContext = (request: express.Request): AuthenticatedContext | null =>
  (request as AuthenticatedRequest)[authContextKey] ?? null;

export const requireAuthenticatedContext = (request: express.Request): AuthenticatedContext => {
  const context = getAuthenticatedContext(request);
  if (!context) throw new Error("No hay un contexto autenticado en la solicitud.");
  return context;
};
