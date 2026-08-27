import assert from "node:assert/strict";
import test from "node:test";
import { getSectorIcon, isSectorIconKey, SECTOR_COLOR_PALETTE, SECTOR_ICON_CATALOG } from "../sectorVisualCatalog.js";

test("el catálogo visual ofrece claves semánticas estables y cobertura mínima", () => {
  assert.ok(SECTOR_ICON_CATALOG.length >= 30);
  assert.equal(new Set(SECTOR_ICON_CATALOG.map(icon => icon.key)).size, SECTOR_ICON_CATALOG.length);
  assert.ok(SECTOR_ICON_CATALOG.every(icon => /^[a-z][a-z0-9-]*$/.test(icon.key) && icon.name && icon.glyph));
  assert.equal(new Set(SECTOR_ICON_CATALOG.map(icon => icon.category)).size, 9);
});

test("la paleta tiene doce colores nombrados, incluido dorado y plateado", () => {
  assert.equal(SECTOR_COLOR_PALETTE.length, 12);
  assert.ok(SECTOR_COLOR_PALETTE.every(color => /^#[0-9A-F]{6}$/.test(color.hex) && color.name));
  assert.deepEqual(SECTOR_COLOR_PALETTE.slice(-2).map(color => color.name), ["Dorado", "Plateado"]);
});

test("resuelve claves y aplica un fallback persistible", () => {
  assert.equal(isSectorIconKey("treasury"), true);
  assert.equal(isSectorIconKey("💰"), false);
  assert.equal(getSectorIcon("unknown").key, "other");
});
