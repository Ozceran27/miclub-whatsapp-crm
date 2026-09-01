import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl=new URL("../../db/migrations/202608310002_sector_capacity_modes.sql",import.meta.url);
const manualUrl=new URL("../../../../docs/dbeaver/administration/04_sector_capacity_modes_manual.sql",import.meta.url);

test("la migración versionada puede ejecutarse después del procedimiento manual",async()=>{
  const [migration,manual]=await Promise.all([readFile(migrationUrl,"utf8"),readFile(manualUrl,"utf8")]);
  for(const name of ["sectors_capacity_mode_allowed_check","sectors_enrollment_capacity_check","sectors_income_capacity_check"]){
    assert.match(manual,new RegExp(`ADD CONSTRAINT ${name}`));
    assert.match(migration,new RegExp(`DROP CONSTRAINT IF EXISTS ${name}`));
    assert.ok(migration.indexOf(`DROP CONSTRAINT IF EXISTS ${name}`)<migration.indexOf(`ADD CONSTRAINT ${name}`));
  }
});

test("la vista canónica aísla tenant, convierte moneda y no suma meses con cotización faltante",async()=>{
  const sql=await readFile(migrationUrl,"utf8");
  assert.match(sql,/SELECT m\.club_id, m\.sector_id/);
  assert.match(sql,/r\.rate_date<=m\.movement_date::date/);
  assert.match(sql,/missing_exchange_rate_count/);
  assert.match(sql,/m\.operational_status='COMPLETADO'/);
  assert.match(sql,/m\.movement_type='INGRESOS'/);
  assert.match(sql,/is_internal_transfer/);
  assert.match(sql,/movement_categories mc ON mc\.id=m\.category_id AND mc\.club_id=m\.club_id/);
  assert.doesNotMatch(sql,/m\.category\b/);
});
