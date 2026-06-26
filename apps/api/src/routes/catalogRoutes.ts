import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getCatalog, listCatalogs } from "../services/catalogService.js";
import { isCatalogName } from "../repositories/catalogRepository.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ catalogs: listCatalogs() });
  })
);

router.get(
  "/:catalog",
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
