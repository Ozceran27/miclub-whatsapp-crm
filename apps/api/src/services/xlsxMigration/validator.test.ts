import assert from "node:assert/strict";
import test from "node:test";
import { maliciousZipFixture, workbookFixture } from "./fixtures/workbookFixtures.js";
import { validateWorkbook } from "./validator.js";

const validate=(buffer:Buffer)=>validateWorkbook(buffer,"import.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

test("lee inline strings y procesa la fila firstDataRow (fila 2)",()=>{
  const result=validate(workbookFixture());
  assert.deepEqual(result.errors,[]); assert.equal(result.rowCounts["ADMINISTRACIÓN"],1);
  assert.equal(result.rows.find((row)=>row.sheet==="ADMINISTRACIÓN")?.rowNumber,2);
  assert.equal(result.rows.find((row)=>row.sheet==="ADMINISTRACIÓN")?.values.amount,1234.5);
});

test("acepta shared strings sólo al resolver la celda exacta",()=>assert.deepEqual(validate(workbookFixture({sharedHeaders:true})).errors,[]));

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
