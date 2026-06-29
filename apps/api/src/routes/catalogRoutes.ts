import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getCatalog, getCatalogItems, listCatalogs } from "../services/catalogService.js";
import { isCatalogName, type CatalogName } from "../repositories/catalogRepository.js";

// productivo: catálogo bajo /api; no renombrar sin migración frontend.
const router = Router();

const catalogEndpoints: Array<{ path: string; catalog: CatalogName }> = [
  { path: "/sectors", catalog: "sectors" },
  { path: "/activities", catalog: "activities" },
  { path: "/instructors", catalog: "instructors" },
  { path: "/movement-categories", catalog: "movement-categories" },
  { path: "/payment-methods", catalog: "payment-methods" },
  { path: "/currencies", catalog: "currencies" },
  { path: "/system-months", catalog: "system-months" },
  { path: "/discount-rates", catalog: "discount-rates" },
  { path: "/salon-hour-prices", catalog: "salon-hour-prices" }
];

for (const endpoint of catalogEndpoints) {
  router.get(
    endpoint.path,
    asyncHandler(async (_req, res) => {
      res.json(await getCatalogItems(endpoint.catalog));
    })
  );
}

router.get(
  "/catalogs",
  asyncHandler(async (_req, res) => {
    res.json({ catalogs: listCatalogs() });
  })
);

router.get(
  "/catalogs/:catalog",
  asyncHandler(async (req, res) => {
    const catalog = String(req.params.catalog);

    if (!isCatalogName(catalog)) {
      return res.status(404).json({
        error: true,
        message: "Catálogo no encontrado.",
        availableCatalogs: listCatalogs()
      });
    }

    return res.json(await getCatalog(catalog));
  })
);

export default router;
