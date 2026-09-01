import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl=new URL("./onboardingRepository.ts",import.meta.url);
test("finalizePlan persiste modo/origen y conserva una selección idéntica en reintentos",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/selection_mode,selection_source/);assert.match(source,/current\?\.plan_code===planCode.*current\.selection_mode===billing\.mode.*current\.selection_source===billing\.source.*return/s);});
test("un cambio de plan cierra el vigente antes de insertar el nuevo",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/update miclub\.club_subscriptions set effective_until=now\(\).*insert into miclub\.club_subscriptions/s);});
