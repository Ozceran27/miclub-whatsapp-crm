import fs from "node:fs";
import express, { Router } from "express";

// productivo: fallback SPA; no renombrar sin migración frontend.
export const createFrontendRoutes = (webIndexPath: string) => {
  const router = Router();

  const jsonError = (res: express.Response, status: number, message: string) =>
    res.status(status).json({ error: true, message });

  const sendFrontendIndex = (res: express.Response) => {
    if (!fs.existsSync(webIndexPath)) {
      return jsonError(res, 500, "Frontend no compilado. Ejecutá npm run build.");
    }

    return res.sendFile(webIndexPath);
  };

  router.get("/", (_req, res) => sendFrontendIndex(res));

  router.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/health") ||
      req.path.startsWith("/api/db") ||
      req.path.startsWith("/api/catalogs") ||
      req.path.startsWith("/members") ||
      req.path.startsWith("/debtors") ||
      req.path.startsWith("/summary") ||
      req.path.startsWith("/sector-operational") ||
      req.path.startsWith("/club-finance") ||
      req.path.startsWith("/admin-movements") ||
      req.path.startsWith("/payments-debug") ||
      req.path.startsWith("/comparison-debug") ||
      req.path.startsWith("/templates") ||
      req.path.startsWith("/history") ||
      req.path.startsWith("/sync-status") ||
      req.path.startsWith("/prepare-messages")
    ) {
      return next();
    }

    return sendFrontendIndex(res);
  });

  return router;
};
