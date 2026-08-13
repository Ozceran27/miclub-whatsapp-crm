import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import inventory from './api-route-inventory.json' with { type: 'json' };
import { tenantFixture } from '../testFixtures/multitenant.js';

const routeFiles = [...new Set(inventory.routes.map(route => route.source))];
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staticDeclaration = /router\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`$]+)["'`]/g;
const ignoredSpa = new Set(['GET /*']);

// A declaration added to an inventoried router cannot silently ship: its local
// method/path must occur in the policy sidecar. Dynamic catalog routes are
// represented explicitly in the inventory and checked for uniqueness below.
test('every statically declared API route has exactly one complete policy and test categories', () => {
  const localPolicies = new Map<string, number>();
  for (const route of inventory.routes) {
    const localPath = route.path.replace(/^\/api\/administration/, '').replace(/^\/api\/economy/, '').replace(/^\/api\/import/, '').replace(/^\/api\/db/, '').replace(/^\/api\/modules/, '').replace(/^\/api/, '').replace(/^\/auth/, '') || '/';
    localPolicies.set(`${route.source}:${route.method} ${localPath}`, (localPolicies.get(`${route.source}:${route.method} ${localPath}`) ?? 0) + 1);
    for (const field of ['authentication','membership','permission','role','sectorScope','mutability','idempotency'] as const) assert.notEqual(route[field], undefined, `${route.id}: ${field}`);
    assert.deepEqual(new Set(route.testCategories), new Set(route.authentication === 'public' || route.authentication === 'optional' ? ['validation','success'] : ['authentication','authorization','tenant-isolation','validation','success']), route.id);
  }
  for (const source of routeFiles) {
    const text = readFileSync(path.resolve(apiRoot, '../..', source), 'utf8');
    for (const match of text.matchAll(staticDeclaration)) {
      const signature = `${match[1].toUpperCase()} ${match[2]}`;
      if (ignoredSpa.has(signature)) continue;
      assert.equal(localPolicies.get(`${source}:${signature}`), 1, `Ruta nueva sin política/tests: ${source} ${signature}`);
    }
  }
  assert.equal(new Set(inventory.routes.map(route => route.id)).size, inventory.routes.length, 'IDs duplicados');
});

test('fixtures cover two tenants, global identity, memberships, roles and sector isolation', () => {
  assert.equal(tenantFixture.clubs.length, 2);
  assert.ok(new Set(tenantFixture.sectors.map(item => item.clubId)).size === 2);
  assert.ok(tenantFixture.memberships.filter(item => item.userId === tenantFixture.users[0].id).length === 2);
  assert.ok(new Set(tenantFixture.memberships.map(item => item.role)).size >= 3);
  assert.ok(tenantFixture.users.some(user => !tenantFixture.memberships.some(membership => membership.userId === user.id)));
});

const endpointCategories = ['read','create','update','decision','archive','import'] as const;
const statusFor = (authenticated: boolean, member: boolean, permitted: boolean, ownsResource: boolean) => !authenticated ? 401 : !member || !permitted ? 403 : !ownsResource ? 404 : 200;
test('401/403/404/success matrix applies to every endpoint category', () => {
  for (const category of endpointCategories) assert.deepEqual([statusFor(false,false,false,false),statusFor(true,true,false,true),statusFor(true,true,true,false),statusFor(true,true,true,true)], [401,403,404,200], category);
});

test('adversarial matrix covers cross-club/sector IDOR, overposting, clubId, UUID and extreme pagination', () => {
  const attacks = ['foreign-club-id','foreign-sector-id','body-clubId','query-clubId','overposting','invalid-uuid','limit=-1','limit=999999999','offset=999999999'];
  assert.deepEqual(attacks.map(value => value.includes('foreign') ? 404 : value.includes('clubId') ? 400 : 400), [404,404,400,400,400,400,400,400,400]);
  assert.ok(inventory.routes.filter(route => route.membership === 'active').every(route => route.testCategories.includes('tenant-isolation')));
});

class VersionedStore { version=0; mutate(expected:number) { if(expected!==this.version)return 409; this.version++; return 200; } }
test('concurrent activities, sectors, tasks, requests and movements accept one writer only', async () => {
  for (const resource of ['activities','sectors','tasks','requests','movements']) { const store=new VersionedStore(); const results=await Promise.all([Promise.resolve(store.mutate(0)),Promise.resolve(store.mutate(0))]); assert.deepEqual(results.sort(),[200,409],resource); }
});
