import { PERMISSIONS } from "@miclub/shared";
import { Router } from "express";
import { getReadOnlyPage, type ReadOnlyResource } from "../repositories/readOnlyRepository.js";
import { normalizeCatalogRow } from "../services/catalogService.js";
import asyncHandler from "./asyncHandler.js";
import { parseListQuery } from "./listQuery.js";
import { requirePermission } from "../middleware/authorization.js";
import type { KnownPermission } from "@miclub/shared";

const router = Router();

const filtersByResource = {
  sectores: ["search", "status", "usesEnrollments", "usesActivities"],
  actividades: ["search", "sectorId", "status", "modality"],
  trabajadores: ["search", "kind"],
  movimientos: ["search", "type", "sectorId", "activityId", "categoryId", "paymentMethodId", "financialStatus", "operationalStatus", "from", "to"],
  inscripciones: ["search", "status", "sectorId", "activityId", "dueFrom", "dueTo"]
} as const satisfies Record<ReadOnlyResource, readonly string[]>;

const permissionsByResource = {
  sectores: PERMISSIONS.SECTORS_VIEW, actividades: PERMISSIONS.ACTIVITIES_VIEW, trabajadores: PERMISSIONS.WORKERS_VIEW,
  movimientos: PERMISSIONS.FINANCE_READ, inscripciones: PERMISSIONS.ENROLLMENTS_VIEW
} as const satisfies Record<ReadOnlyResource, KnownPermission>;

const createReadOnlyHandler = (resource: ReadOnlyResource) => asyncHandler(async (req, res) => {
  const query = parseListQuery(req, filtersByResource[resource], { defaultLimit: 20, maxLimit: 100 });
  const { rows, total } = await getReadOnlyPage(resource, {
    clubId: req.auth!.clubId,
    limit: query.limit,
    offset: query.offset,
    filters: query.filters,
    sectorIds: req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? undefined : req.auth!.sectorIds
  });

  res.json({
    items: rows.map(normalizeCatalogRow),
    page: Math.floor(query.offset / query.limit) + 1,
    pageSize: query.limit,
    total
  });
});

const csvCell = (value: unknown): string => `"${String(value ?? "").replaceAll('"', '""')}"`;
for (const resource of ["movimientos", "inscripciones"] as const) {
  router.get(`/${resource}/export.csv`, requirePermission(permissionsByResource[resource]), asyncHandler(async (req, res) => {
    const query = parseListQuery(req, filtersByResource[resource], { defaultLimit: 10_000, maxLimit: 10_000 });
    const { rows } = await getReadOnlyPage(resource, {
      clubId: req.auth!.clubId, limit: query.limit, offset: 0, filters: query.filters,
      sectorIds: req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? undefined : req.auth!.sectorIds
    });
    const normalized = rows.map(normalizeCatalogRow);
    const headers = normalized.length ? Object.keys(normalized[0]) : ["sequenceNumber"];
    const csv = [headers.map(csvCell).join(","), ...normalized.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${resource}.csv"`);
    res.send(`\uFEFF${csv}`);
  }));
}

for (const resource of Object.keys(permissionsByResource) as ReadOnlyResource[]) {
  router.get(`/${resource}`, requirePermission(permissionsByResource[resource]), createReadOnlyHandler(resource));
}

export default router;
