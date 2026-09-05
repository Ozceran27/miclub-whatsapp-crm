import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationManifest } from "./migrationManifest.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const walk = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
  const entryPath=path.join(directory,entry.name);
  return entry.isDirectory()?walk(entryPath):[entryPath];
}))).flat();

const enumMembers = async () => {
  const bootstrap=await readFile(path.join(migrationsDir,"202606260001_create_miclub_import_schema.sql"),"utf8");
  const declaration=bootstrap.match(/create type miclub\.financial_status as enum \(([^;]+)\)/i)?.[1];
  assert.ok(declaration,"no se encontró la declaración canónica de financial_status");
  const members=new Set([...declaration.matchAll(/'([^']+)'/g)].map(match=>match[1]));
  for(const migration of migrationManifest){
    const sql=await readFile(path.join(migrationsDir,migration.path),"utf8");
    for(const match of sql.matchAll(/alter type miclub\.financial_status add value if not exists '([^']+)'/gi))members.add(match[1]);
  }
  return members;
};

test("los literales tipados de financial_status existen en el enum canónico", async () => {
  const allowed=await enumMembers();
  const files=[...(await walk(migrationsDir)),...(await walk(sourceDir))].filter(file=>/\.(?:sql|ts)$/.test(file)&&!file.endsWith("financialStatusSqlGuard.test.ts"));
  const invalid:string[]=[];
  for(const file of files){
    const contents=await readFile(file,"utf8");
    for(const match of contents.matchAll(/'([^']+)'\s*::\s*miclub\.financial_status/gi))if(!allowed.has(match[1]))invalid.push(`${path.relative(migrationsDir,file)}: ${match[1]}`);
  }
  assert.deepEqual(invalid,[]);
});

test("la definición forward activa tipa todo financial_status insertado", async () => {
  const active=migrationManifest.filter(entry=>entry.path.includes("opening_balance_financial_status")).at(-1);
  assert.ok(active,"falta la migración forward correctiva de saldos iniciales");
  const sql=await readFile(path.join(migrationsDir,active.path),"utf8");
  const body=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION miclub.replace_opening_balances"),sql.indexOf("CREATE OR REPLACE FUNCTION miclub.reverse_opening_balances"));
  assert.equal((body.match(/financial_status,operational_status/g)??[]).length,2);
  assert.equal((body.match(/'pagado'::miclub\.financial_status/g)??[]).length,2);
  assert.doesNotMatch(body,/'cobrado'/i);
});
