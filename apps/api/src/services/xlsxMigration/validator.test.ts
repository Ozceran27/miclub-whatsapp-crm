import assert from "node:assert/strict";
import test from "node:test";
import { maliciousZipFixture, referenceWorkbookFixtures, workbookFixture } from "./fixtures/workbookFixtures.js";
import { resolveReferenceRows, type ReferenceCatalog } from "./referenceResolver.js";
import { validateWorkbook } from "./validator.js";

const validate=(buffer:Buffer)=>validateWorkbook(buffer,"import.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

test("lee inline strings y procesa la fila firstDataRow (fila 2)",()=>{
  const result=validate(workbookFixture());
  assert.deepEqual(result.errors,[]); assert.equal(result.rowCounts["ADMINISTRACIÓN"],1);
  assert.equal(result.rows.find((row)=>row.sheet==="ADMINISTRACIÓN")?.rowNumber,2);
  assert.equal(result.rows.find((row)=>row.sheet==="ADMINISTRACIÓN")?.values.amount,1234.5);
});

test("acepta shared strings sólo al resolver la celda exacta",()=>assert.deepEqual(validate(workbookFixture({sharedHeaders:true})).errors,[]));

test("los nombres y firmas son contractuales, no el orden de hojas",()=>assert.deepEqual(validate(workbookFixture({reverseSheets:true})).errors,[]));

test("extrae las referencias presentes sin inventar sector o instructor derivados",()=>{
  const result=validate(workbookFixture({movementValues:{sector:"  Fútbol  "},enrollmentValues:{activity:" Tenis "}}));
  const movement=result.referenceRows.find((row)=>row.sheet==="ADMINISTRACIÓN");
  const enrollment=result.referenceRows.find((row)=>row.sheet==="INSCRIPCIONES");
  assert.equal(movement?.sector,"Fútbol"); assert.equal(enrollment?.activity,"Tenis");
  assert.equal(enrollment?.sector,undefined); assert.equal(enrollment?.instructor,undefined);
});

test("rechaza headers intercambiados aunque ambos textos existan globalmente",()=>{
  const errors=validate(workbookFixture({swappedHeaders:true,sharedHeaders:true})).errors;
  assert.equal(errors.filter(({error_code})=>error_code==="INVALID_HEADERS").length,2);
});

test("reporta celdas requeridas ausentes por fila",()=>{
  const errors=validate(workbookFixture({missingRequiredCell:true})).errors;
  assert.ok(errors.some((error)=>error.error_code==="REQUIRED_VALUE"&&error.row_number===2&&error.field==="concept"));
});

test("valida fechas, decimales y enums en cada fila",()=>{
  const errors=validate(workbookFixture({movementValues:{date:"2026-02-30",amount:"12x",type:"OTRO",status:"DESCONOCIDO"}})).errors;
  assert.deepEqual(errors.map(({error_code})=>error_code).sort(),["INVALID_DATE","INVALID_DECIMAL","INVALID_ENUM","INVALID_ENUM"]);
  assert.ok(errors.every(({row_number})=>row_number===2));
});

test("rechaza fórmulas aunque tengan un valor almacenado",()=>assert.ok(validate(workbookFixture({formula:true})).errors.some(({error_code})=>error_code==="FORMULAS_NOT_ALLOWED")));

test("convierte un ZIP con ruta maliciosa en un error de validación",()=>assert.equal(validate(maliciousZipFixture()).errors[0]?.error_code,"UNSAFE_ZIP_PATH"));

test("fixtures XLSX cubren referencias exactas, normalizadas, inexistentes y ambiguas",()=>{
  const base:ReferenceCatalog={sectors:[{id:"s1",name:"Fútbol"}],activities:[{id:"a1",name:"Infantiles",sectorId:"s1",instructorId:"i1"}],instructors:[{id:"i1",name:"Responsable"}],categories:[{id:"c1",name:"Cuotas"}]};
  for(const fixture of [referenceWorkbookFixtures.exact,referenceWorkbookFixtures.normalized]) {
    const parsed=validate(fixture()); assert.deepEqual(parsed.errors,[]); assert.deepEqual(resolveReferenceRows(parsed.referenceRows,base).errors,[]);
  }
  const missing=validate(referenceWorkbookFixtures.missing());
  assert.ok(resolveReferenceRows(missing.referenceRows,base).errors.some(({error_code})=>error_code==="SECTOR_NOT_FOUND"));
  const ambiguous=validate(referenceWorkbookFixtures.ambiguous());
  assert.ok(resolveReferenceRows(ambiguous.referenceRows,{...base,sectors:[...base.sectors,{id:"s2",name:"Futból"}]}).errors.some(({error_code})=>error_code==="REFERENCE_AMBIGUOUS"));
});

test("fixture XLSX conserva el instructor responsable derivado aunque exista otro instructor",()=>{
  const parsed=validate(referenceWorkbookFixtures.wrongInstructor());
  const result=resolveReferenceRows(parsed.referenceRows,{sectors:[],activities:[{id:"a1",name:"Infantiles",sectorId:"s1",instructorId:"responsable"}],instructors:[{id:"responsable",name:"Ana"},{id:"otro",name:"Bruno"}],categories:[{id:"c1",name:"Cuotas"}]});
  assert.equal(result.resolved.find(({sheet})=>sheet==="INSCRIPCIONES")?.instructorId,"responsable");
});
