import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../../db/postgres.js";
import { applyWorkbook, type WorkbookInput } from "./workbook.js";

const input=(clubId="club-a"):WorkbookInput=>({
  actor:{clubId,userId:"00000000-0000-0000-0000-000000000001",membershipId:"00000000-0000-0000-0000-000000000002"},
  sha256:"file",batchIdentity:"identity",templateVersion:"v2",sourceFile:"import.xlsx",idempotencyKey:null,referenceConfigHash:"refs",dryRunOfBatchId:"dry",
  rows:[{sheet:"ADMINISTRACIÓN",rowNumber:2,values:{date:"2026-08-01",type:"INGRESO",concept:"Cuota",amount:10,taxes:0,status:"COMPLETADO"},sourceValues:[]}],
  resolvedRows:[{sheet:"ADMINISTRACIÓN",rowNumber:2,sectorId:"sector",activityId:null,instructorId:null,categoryId:"category",paymentMethodId:null,personId:null,externalReference:null,rowFingerprint:"a".repeat(64)}],
  projectedWrites:1,errors:[],metadata:{rowCounts:{"ADMINISTRACIÓN":1}},
});

type Harness={deps:Parameters<typeof applyWorkbook>[1];queries:{sql:string;params:unknown[]}[];audits:string[];commits:number;rollbacks:number};
const harness=(options:{duplicate?:boolean;failMovement?:boolean}={}):Harness=>{
 const queries:{sql:string;params:unknown[]}[]=[]; const audits:string[]=[]; const state={commits:0,rollbacks:0};
 const db={query:async<T>(sql:string,params:unknown[]=[])=>{queries.push({sql,params}); if(sql.includes("status='dry_run'")) return {rows:[{id:"dry"}] as T[]}; if(sql.includes("BATCH")||sql.includes("operation_type='apply'")) return {rows:(options.duplicate?[{id:"prior"}]:[]) as T[]}; if(options.failMovement&&sql.includes("insert into miclub.movements")) throw new Error("middle row"); return {rows:(sql.includes("returning id")?[{id:"entity"}]:[]) as T[]};}} as QueryExecutor;
 const transaction=async<T>(clubId:string,callback:(executor:QueryExecutor)=>Promise<T>)=>{assert.ok(clubId);try{const value=await callback(db);state.commits++;return value;}catch(error){state.rollbacks++;throw error;}};
 return {deps:{transaction,audit:async(event)=>{audits.push(event.action);return "audit";}},queries,audits,get commits(){return state.commits;},get rollbacks(){return state.rollbacks;}};
};

test("apply persiste ambas escrituras y completa sólo al final del commit",async()=>{const h=harness();const result=await applyWorkbook(input(),h.deps);assert.equal(result.persistedWrites,2);assert.match(h.queries.at(-1)!.sql,/status='completed'/);assert.equal(h.commits,1);});
test("un fallo en una fila intermedia revierte el lote y audita el fallo",async()=>{const h=harness({failMovement:true});await assert.rejects(applyWorkbook(input(),h.deps),/middle row/);assert.equal(h.rollbacks,1);assert.ok(h.audits.includes("xlsx_import.failed"));assert.ok(!h.queries.some(({sql})=>/^update miclub\.import_batches set status='completed'/.test(sql)));});
test("un reintento posterior a rollback puede completar",async()=>{const failed=harness({failMovement:true});await assert.rejects(applyWorkbook(input(),failed.deps));const retry=harness();assert.equal((await applyWorkbook(input(),retry.deps)).status,"completed");});
test("un lote exacto ya completado se rechaza sin escribir filas",async()=>{const h=harness({duplicate:true});await assert.rejects(applyWorkbook(input(),h.deps),(error:any)=>error.code==="BATCH_ALREADY_EXECUTED");assert.ok(!h.queries.some(({sql})=>sql.includes("insert into miclub.movements")));});
test("dos clubes mantienen club_id independiente en todas las escrituras",async()=>{for(const club of ["club-a","club-b"]){const h=harness();await applyWorkbook(input(club),h.deps);for(const query of h.queries.filter(({sql})=>/insert into miclub\.(?:movements|xlsx_import_rows)/.test(sql))) assert.equal(query.params[0],club);}});
