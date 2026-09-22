import assert from 'node:assert/strict';
import test from 'node:test';
import { areActivitySchedulesValid, isActivityPrice } from './activityConfiguration.js';

void test('precios aceptan cero y enteros, no negativos ni decimales',()=>{
  assert.equal(isActivityPrice(0),true);
  assert.equal(isActivityPrice(999999999999),true);
  for(const value of [-1,0.01,1000000000000,NaN,'100']) assert.equal(isActivityPrice(value),false);
});

void test('horarios admiten bloques adyacentes pero rechazan duplicados y solapados',()=>{
  const morning={weekday:1,startTime:'09:00',endTime:'10:00'};
  assert.equal(areActivitySchedulesValid([]),true);
  assert.equal(areActivitySchedulesValid([morning,{weekday:1,startTime:'10:00',endTime:'11:00'}]),true);
  assert.equal(areActivitySchedulesValid([morning,morning]),false);
  assert.equal(areActivitySchedulesValid([morning,{weekday:1,startTime:'09:30',endTime:'10:30'}]),false);
  assert.equal(areActivitySchedulesValid([{...morning,endTime:'08:00'}]),false);
  assert.equal(areActivitySchedulesValid([{...morning,weekday:7}]),false);
});
