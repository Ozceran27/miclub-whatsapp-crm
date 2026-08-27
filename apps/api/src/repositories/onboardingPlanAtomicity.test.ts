import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sourceUrl=new URL("./onboardingRepository.ts",import.meta.url);
test("selección, auditoría, finalización y resolución comparten el executor transaccional",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/readCommercialPlanCatalog\(db\)/);assert.match(source,/club_subscriptions[\s\S]*billing_status[\s\S]*auditService\.sensitiveChange/);assert.match(source,/onboarding\.plan\.change/);assert.match(source,/const state=map\(\(await db\.query<Row>\(select/);assert.match(source,/withTenantTransaction\(actor\.clubId,async db=>/);});
test("FREE bloquea migración y el retry completado retorna antes de nuevas escrituras",async()=>{const source=await readFile(sourceUrl,"utf8");assert.match(source,/if\(before\.status==='COMPLETED'\)return/);assert.match(source,/draft\.pendingImport&&!selectedPlan\.capabilities\.includes\('DATA_MIGRATION'\)/);assert.match(source,/ONBOARDING_PLAN_MIGRATION_FORBIDDEN/);});
