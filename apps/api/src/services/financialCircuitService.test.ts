import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialCircuit, PersistedSettlement } from '@miclub/shared';
import { calculateBalanceTotals, planResponsiblePayment } from './financialCircuitService.js';

test('separa saldos a liquidar, a cobrar y remuneración fija por moneda', () => {
  const totals = calculateBalanceTotals([
    { currencyCode: 'ARS', balance: 40_000 },
    { currencyCode: 'ARS', balance: -25_000 },
    { currencyCode: 'USD', balance: 100 },
  ], [
    { currencyCode: 'ARS', balance: 12_000, reviewState: 'APPROVED' },
    { currencyCode: 'ARS', balance: 9_000, reviewState: 'DRAFT' },
  ]);
  assert.deepEqual(totals, [
    { currencyCode: 'ARS', activityToPay: 40_000, activityToCollect: 25_000, fixedCompensationToPay: 12_000, totalToPay: 52_000 },
    { currencyCode: 'USD', activityToPay: 100, activityToCollect: 0, fixedCompensationToPay: 0, totalToPay: 100 },
  ]);
});

const settlement = (id:string,month:string,balance:number,reviewState:PersistedSettlement['reviewState']='APPROVED'):PersistedSettlement => ({
  id,month,balance,reviewState,revision:1,closedAt:null,activityId:'activity',personId:'person',termId:'term',
  currencyCode:'ARS',income:0,refunds:0,responsibleIncome:0,responsibleRefunds:0,fixedClubFee:0,
  payments:0,debtCollections:0,paymentState:balance<0?'DEBT':'PENDING',activityName:'Actividad',personName:'Persona',
});
const circuit = (rows:PersistedSettlement[]):FinancialCircuit => ({
  month:'2026-09',today:'2026-09-25',settlements:rows,balanceTotals:[],diagnostics:[],
  projection:{calculatedAt:'2026-09-25',currencyCode:'ARS',liquidity:0,pendingCollections:0,pendingPayments:0,pendingSettlements:0,expectedSettlements:0,additionalClubReceivables:0,projectedBalance:0,futureEstimate:0,complete:true,assumptions:[]},
  accounts:[],people:[],terms:[],
});

test('vista previa compensa deuda y distribuye por antigüedad sin superar el neto',()=>{
  const data=circuit([settlement('credit-late','2026-09',300),settlement('debt','2026-07',-120),settlement('credit-early','2026-08',200)]);
  const plan=planResponsiblePayment(data,'person','ARS',250,false,'account');
  assert.equal(plan.net,380);
  assert.deepEqual(plan.compensations.map(item=>[item.debt.id,item.credit.id,item.amount]),[['debt','credit-early',120]]);
  assert.deepEqual(plan.portions.map(item=>[item.line.id,item.amount]),[['credit-early',80],['credit-late',170]]);
  assert.throws(()=>planResponsiblePayment(data,'person','ARS',381,false,'account'),/supera/);
  assert.equal(planResponsiblePayment(data,'person','ARS',250,false,'account').previewHash,plan.previewHash);
  assert.notEqual(planResponsiblePayment(data,'person','ARS',250,false,'different-account').previewHash,plan.previewHash);
  assert.notEqual(planResponsiblePayment(circuit([settlement('credit-late','2026-09',301),settlement('debt','2026-07',-120),settlement('credit-early','2026-08',200)]),'person','ARS',250,false,'account').previewHash,plan.previewHash);
});

test('vista previa requiere aprobación de todas las obligaciones y cobra saldo negativo',()=>{
  assert.throws(()=>planResponsiblePayment(circuit([settlement('draft','2026-09',50,'REQUIRES_REVIEW')]),'person','ARS',10,false,'account'),/Revise/);
  const plan=planResponsiblePayment(circuit([settlement('debt','2026-09',-100)]),'person','ARS',60,true,'account');
  assert.equal(plan.net,-100);
  assert.deepEqual(plan.portions.map(item=>[item.line.id,item.amount]),[['debt',60]]);
  assert.throws(()=>planResponsiblePayment(circuit([settlement('debt','2026-09',-100)]),'person','ARS',60,false,'account'),/supera/);
});
