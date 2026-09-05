import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la finalización persiste icon_key del borrador sin derivarlo de la plantilla", async () => {
  const source = await readFile(new URL("./onboardingRepository.ts", import.meta.url), "utf8");
  assert.match(source, /insert into miclub\.sectors\(club_id,template_id,code,name,icon_key,color/);
  assert.match(source, /item\.name\.trim\(\),item\.iconKey,item\.color/);
});

test("la finalización sólo persiste el término económico y no inventa una cuota de inscripción", async () => {
  const source = await readFile(new URL("./onboardingRepository.ts", import.meta.url), "utf8");
  const finalizeActivities = source.slice(source.indexOf("async function finalizeActivities"), source.indexOf("async function finalizeFileAssociations"));
  assert.doesNotMatch(finalizeActivities, /monthly_fee|enrollment_fee|enrollmentFee/);
  assert.match(finalizeActivities, /activity_terms\(club_id,activity_id,mode,fixed_club_fee,fixed_fee_frequency,currency_code,club_share_percentage/);
  assert.match(finalizeActivities, /item\.fixedClubFee,item\.fixedFeeFrequency,item\.currencyCode,item\.clubSharePercentage/);
});

test("asocia el identificador opaco de foto al empleado dentro de la finalización",async()=>{const source=await readFile(new URL("./onboardingRepository.ts",import.meta.url),"utf8");const phase=source.slice(source.indexOf("async function finalizeFileAssociations"),source.indexOf("/** One transaction"));assert.match(phase,/worker\.photoFileId/);assert.match(phase,/employee_id=\$3,status='active',expires_at=null/);assert.match(phase,/club_id=\$2 and status='temporary' and expires_at>now\(\)/);assert.doesNotMatch(phase,/base64|public_url|data:/i);});

test("los errores PostgreSQL de saldos iniciales se traducen sin filtrar detalles internos", async () => {
  const { translateOpeningBalancesError } = await import("./openingBalancesError.js");
  const internal = Object.assign(new Error('invalid input value for enum miclub.financial_status: "cobrado"'), { code: "22P02", detail: "SQL interno" });
  const translated = translateOpeningBalancesError(internal) as Error & { code?: string; status?: number; expose?: boolean };
  assert.equal(translated.code, "OPENING_BALANCES_PERSISTENCE_ERROR");
  assert.equal(translated.status, 422);
  assert.equal(translated.expose, true);
  assert.doesNotMatch(translated.message, /cobrado|financial_status|PostgreSQL|SQL interno/i);
});
