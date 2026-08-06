import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getCatalog, getCatalogItems, listCatalogs } from "../services/catalogService.js";
import { isCatalogName, type CatalogName } from "../repositories/catalogRepository.js";
import { requirePermission } from "../middleware/authorization.js";
import type { KnownPermission } from "@miclub/shared";

// productivo: catálogo bajo /api; no renombrar sin migración frontend.
const router = Router();

const catalogEndpoints: Array<{ path: string; catalog: CatalogName; permission: KnownPermission }> = [
  { path: "/sectors", catalog: "sectors", permission: "sectors.view" },
  { path: "/activities", catalog: "activities", permission: "activities.view" },
  { path: "/instructors", catalog: "instructors", permission: "workers.view" },
  { path: "/movement-categories", catalog: "movement-categories", permission: "finance:read" },
  { path: "/payment-methods", catalog: "payment-methods", permission: "finance:read" },
  { path: "/currencies", catalog: "currencies", permission: "finance:read" },
  { path: "/system-months", catalog: "system-months", permission: "finance:read" },
  { path: "/discount-rates", catalog: "discount-rates", permission: "administration.view" },
  { path: "/salon-hour-prices", catalog: "salon-hour-prices", permission: "administration.view" }
];

for (const endpoint of catalogEndpoints) {
  router.get(
    endpoint.path,
    requirePermission(endpoint.permission),
    asyncHandler(async (req, res) => {
      res.json(await getCatalogItems(req.auth!, endpoint.catalog));
    })
  );
}

router.get(
  "/catalogs",
  requirePermission("administration.view"),
  asyncHandler(async (_req, res) => {
    res.json({ catalogs: listCatalogs() });
  })
);

router.get(
  "/catalogs/:catalog",
  requirePermission("administration.view"),
  asyncHandler(async (req, res) => {
    const catalog = String(req.params.catalog);

    if (!isCatalogName(catalog)) {
      return res.status(404).json({
        error: true,
        message: "Catálogo no encontrado.",
        availableCatalogs: listCatalogs()
      });
    }

    return res.json(await getCatalog(req.auth!, catalog));
  })
);

export default router;
