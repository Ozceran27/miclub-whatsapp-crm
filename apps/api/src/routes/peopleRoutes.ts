import { Router } from "express";
import asyncHandler from "./asyncHandler.js";
import { getPeople } from "../repositories/peopleRepository.js";
import { normalizeCatalogRow } from "../services/catalogService.js";

// productivo: personas bajo /api; no renombrar sin migración frontend.
const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parsePositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
};

router.get(
  "/people",
  asyncHandler(async (req, res) => {
    const requestedLimit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = parsePositiveInteger(req.query.offset, 0);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const { rows, total } = await getPeople({ limit, offset, search });

    res.json({
      items: rows.map(normalizeCatalogRow),
      total,
      limit,
      offset
    });
  })
);

export default router;
