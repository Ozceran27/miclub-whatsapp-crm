import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("onboarding persiste y audita ambos datos de capacidad para sectores nuevos y de sistema",async()=>{
 const source=await readFile(new URL("./onboardingRepository.ts",import.meta.url),"utf8");
 const body=source.slice(source.indexOf("async function finalizeSectors"),source.indexOf("async function finalizeWorkers"));
 assert.match(body,/capacity_mode,configured_capacity/);
 assert.match(body,/item\.capacityMode,item\.configuredCapacity/);
 assert.match(body,/onboarding\.sector_created/);
 assert.match(body,/onboarding\.system_sector_capacity_updated/);
 assert.match(body,/newData:\{capacityMode:item\.capacityMode,configuredCapacity:item\.configuredCapacity\}/);
});
