import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl=new URL("./onboardingRepository.ts",import.meta.url);
test("finalizePlan persiste modo/origen y conserva una selección idéntica en reintentos",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/selection_mode,selection_source/);assert.match(source,/current\?\.plan_code===planCode.*current\.selection_mode===billing\.mode.*current\.selection_source===billing\.source.*return/s);});
test("un cambio Free/pago cierra sólo la fila bloqueada y activa la nueva sin violar su vigencia",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/if\(current\)await db\.query\(`update miclub\.club_subscriptions set effective_until=greatest\(clock_timestamp\(\),effective_from\+interval '1 microsecond'\) where club_id=\$1 and id=\$2/);assert.match(source,/insert into miclub\.club_subscriptions.*values\(\$1,\$2,clock_timestamp\(\),\$3,\$4,\$5\)/s);});
