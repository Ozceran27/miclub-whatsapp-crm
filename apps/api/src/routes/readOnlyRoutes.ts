import { Router } from "express";
import { getReadOnlyPage, type ReadOnlyResource } from "../repositories/readOnlyRepository.js";
import { normalizeCatalogRow } from "../services/catalogService.js";
import asyncHandler from "./asyncHandler.js";
import { parseListQuery } from "./listQuery.js";

const router = Router();

const filtersByResource = {
  sectores: ["search", "status", "usesEnrollments", "usesActivities"],
  actividades: ["search", "sectorId", "status", "modality"],
  trabajadores: ["search", "kind"],
  movimientos: ["search", "type", "sectorId", "categoryId", "paymentMethodId", "financialStatus", "operationalStatus", "from", "to"],
  inscripciones: ["search", "status", "sectorId", "activityId", "dueFrom", "dueTo"]
} as const satisfies Record<ReadOnlyResource, readonly string[]>;

const createReadOnlyHandler = (resource: ReadOnlyResource) => asyncHandler(async (req, res) => {
  const query = parseListQuery(req, filtersByResource[resource], { defaultLimit: 20, maxLimit: 100 });
  const { rows, total } = await getReadOnlyPage(resource, {
    clubId: req.auth!.clubId,
    limit: query.limit,
    offset: query.offset,
    filters: query.filters
  });

  res.json({
    items: rows.map(normalizeCatalogRow),
    page: Math.floor(query.offset / query.limit) + 1,
    pageSize: query.limit,
    total
  });
});

router.get("/sectores", createReadOnlyHandler("sectores"));
router.get("/actividades", createReadOnlyHandler("actividades"));
router.get("/trabajadores", createReadOnlyHandler("trabajadores"));
router.get("/movimientos", createReadOnlyHandler("movimientos"));
router.get("/inscripciones", createReadOnlyHandler("inscripciones"));

export default router;
