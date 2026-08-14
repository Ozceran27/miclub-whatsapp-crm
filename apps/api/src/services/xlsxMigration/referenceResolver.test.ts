import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComparableText } from "../../importers/normalizers.js";
import { resolveReferenceRows, type ReferenceCatalog } from "./referenceResolver.js";

test("normalizeComparableText unifica caja, tildes, NFC/NFD y espacios",()=>{
  assert.equal(normalizeComparableText("  FÚTBOL\t FEMENINO  "),"futbol femenino");
  assert.equal(normalizeComparableText("Fu\u0301tbol\u00a0Femenino"),"futbol femenino");
});

const catalog:ReferenceCatalog={
  sectors:[{id:"s1",name:"Fútbol"},{id:"s2",name:"Tenis"}],
  instructors:[{id:"i1",name:"María Núñez"},{id:"i2",name:"Juan Pérez"}],
  activities:[{id:"a1",name:"Infantiles",sectorId:"s1",instructorId:"i1",modality:"Mensual"}],
};
const row=(overrides:Record<string,unknown>={})=>({sheet:"INSCRIPCIONES",rowNumber:3,sector:" FUTBOL ",activity:"infantíles",modality:"mensual",instructor:"MARIA NUÑEZ",values:["x"],...overrides});

test("resuelve relaciones normalizadas y conserva referencia/fingerprint sin deduplicar",()=>{
  const result=resolveReferenceRows([row({externalReference:" ERP-42 "}),row({rowNumber:4,externalReference:"ERP-43"})],catalog);
  assert.deepEqual(result.errors,[]); assert.equal(result.resolved[0].externalReference,"ERP-42");
  assert.equal(result.resolved[0].rowFingerprint,result.resolved[1].rowFingerprint);
});

test("rechaza referencias ambiguas en vez de elegir arbitrariamente",()=>{
  const result=resolveReferenceRows([row()],{...catalog,sectors:[...catalog.sectors,{id:"s3",name:"Futból"}]});
  assert.ok(result.errors.some((error)=>error.error_code==="REFERENCE_AMBIGUOUS")); assert.equal(result.resolved[0].sectorId,null);
});

test("emite not-found y mismatches de sector y responsable",()=>{
  const missing=resolveReferenceRows([row({sector:"inexistente",activity:"otra",instructor:"nadie"})],catalog);
  assert.deepEqual(missing.errors.map((e)=>e.error_code),["SECTOR_NOT_FOUND","ACTIVITY_NOT_FOUND","INSTRUCTOR_NOT_FOUND"]);
  const crossed=resolveReferenceRows([row({sector:"Tenis",instructor:"Juan Pérez"})],catalog);
  assert.deepEqual(crossed.errors.map((e)=>e.error_code),["ACTIVITY_SECTOR_MISMATCH","ACTIVITY_INSTRUCTOR_MISMATCH"]);
});

test("un catálogo del tenant no permite resolver referencias de otro club",()=>{
  const otherClub={sectors:[{id:"foreign",name:"Fútbol"}],activities:[],instructors:[]};
  const result=resolveReferenceRows([row()],otherClub);
  assert.ok(result.errors.some((error)=>error.error_code==="ACTIVITY_NOT_FOUND"));
  assert.ok(result.errors.some((error)=>error.error_code==="INSTRUCTOR_NOT_FOUND"));
});
