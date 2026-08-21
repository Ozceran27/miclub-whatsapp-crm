import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../../db/migrations/202608210001_operational_currency_opening_balances.sql",import.meta.url),"utf8");
test("persiste solamente monedas operativas soportadas",()=>{
  assert.match(migration,/operational_currency_code text REFERENCES miclub\.currencies/);
  for(const currency of ["ARS","USD","BRL","EUR"])assert.match(migration,new RegExp(`'${currency}'`));
});
test("el doble envío devuelve el mismo lote antes de crear otra revisión",()=>{
  assert.match(migration,/WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key;[\s\S]*IF v_batch IS NOT NULL THEN RETURN v_batch; END IF;[\s\S]*max\(revision\)/);
});
test("un nuevo lote sustituye y revierte el anterior desde movimientos CAPITAL",()=>{
  assert.match(migration,/status='APPLIED'[\s\S]*SET status='SUPERSEDED'/);
  assert.match(migration,/'CAPITAL','Reversión saldo inicial'[\s\S]*'CAPITAL','Saldo inicial'/);
  assert.match(migration,/VALUES \('CASH',p_cash\),\('BANK',p_bank\),\('USD_CASH',p_usd_cash\)/);
});
