import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la finalización persiste icon_key del borrador sin derivarlo de la plantilla", async () => {
  const source = await readFile(new URL("./onboardingRepository.ts", import.meta.url), "utf8");
  assert.match(source, /insert into miclub\.sectors\(club_id,template_id,code,name,icon_key,color/);
  assert.match(source, /item\.name\.trim\(\),item\.iconKey,item\.color/);
});
