import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sourceUrl=new URL("./onboardingRepository.ts",import.meta.url);
test("plan, entidades, archivos y resultado comparten el executor transaccional",async()=>{const source=await readFile(sourceUrl,"utf8");for(const phase of ['finalizePlan','finalizeBalances','finalizeSectors','finalizeWorkers','finalizeActivities','finalizeFileAssociations'])assert.match(source,new RegExp(`async function ${phase}\\(ctx:CompletionContext`));assert.match(source,/withTenantTransaction\(actor\.clubId,async db=>/);});
test("la clave por club y operación devuelve el resultado previo antes de escribir",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/operation='COMPLETE_ONBOARDING' for update/);assert.match(source,/return completionResultFromRow\(previous\.rows\[0\]\.result\)/);assert.match(source,/ONBOARDING_PLAN_MIGRATION_FORBIDDEN/);});
