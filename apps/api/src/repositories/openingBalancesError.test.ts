import test from 'node:test';
import assert from 'node:assert/strict';
import { translateOpeningBalancesError } from './openingBalancesError.js';

void test('missing sequence is a deployment error, not invalid user balances',()=>{
 const failure=Object.assign(new Error('private database row'),{code:'23502',column:'sequence_number'});
 const translated=translateOpeningBalancesError(failure) as Error & {code:string;status:number};
 assert.equal(translated.code,'ONBOARDING_SCHEMA_UNAVAILABLE');
 assert.equal(translated.status,503);
 assert.doesNotMatch(translated.message,/private database row|sequence_number/);
 assert.equal(translated.cause,failure);
});
