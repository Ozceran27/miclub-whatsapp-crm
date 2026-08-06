import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getCatalog, getCatalogItems, listCatalogs } from "../services/catalogService.js";
import { isCatalogName, type CatalogName } from "../repositories/catalogRepository.js";
import { requirePermission } from "../middleware/authorization.js";
import type { KnownPermission } from "@miclub/shared";

// productivo: catálogo bajo /api; no renombrar sin migración frontend.
const router = Router();

const catalogEndpoints: Array<{ path: string; catalog: CatalogName; permission: KnownPermission }> = [
  { path: "/sectors", catalog: "sectors", permission: PERMISSIONS.SECTORS_VIEW },
  { path: "/activities", catalog: "activities", permission: PERMISSIONS.ACTIVITIES_VIEW },
  { path: "/instructors", catalog: "instructors", permission: PERMISSIONS.WORKERS_VIEW },
  { path: "/movement-categories", catalog: "movement-categories", permission: PERMISSIONS.FINANCE_READ },
  { path: "/payment-methods", catalog: "payment-methods", permission: PERMISSIONS.FINANCE_READ },
  { path: "/currencies", catalog: "currencies", permission: PERMISSIONS.FINANCE_READ },
  { path: "/system-months", catalog: "system-months", permission: PERMISSIONS.FINANCE_READ },
  { path: "/discount-rates", catalog: "discount-rates", permission: PERMISSIONS.ADMINISTRATION_VIEW },
  { path: "/salon-hour-prices", catalog: "salon-hour-prices", permission: PERMISSIONS.ADMINISTRATION_VIEW }
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
  requirePermission(PERMISSIONS.ADMINISTRATION_VIEW),
  asyncHandler(async (_req, res) => {
    res.json({ catalogs: listCatalogs() });
  })
);

router.get(
  "/catalogs/:catalog",
  requirePermission(PERMISSIONS.ADMINISTRATION_VIEW),
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
