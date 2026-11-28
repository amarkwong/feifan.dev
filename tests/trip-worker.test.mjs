import test from 'node:test';
import assert from 'node:assert/strict';
import {handle, verifyAccess, checkPlan} from '../infra/trip-worker.js';
import {sqliteD1} from '../scripts/d1-sqlite.mjs';

const plan = (extra = {}) => ({version: 1, start: '2026-12-26', end: '2027-01-15', items: [{id: 'china', type: 'country', title: 'China', start: 0, days: 5, width: 130, parent: null}], ...extra});
const env = () => ({DB: sqliteD1(), TRIP_EDITORS: 'me@example.test, Partner@Example.test'});
const asUser = email => ({verify: async () => email});
const call = (e, method, {body, user = 'me@example.test', query = '', headers = {}, raw} = {}) => handle(
  new Request(`https://lounge.test/api/trip/plan${query}`, {method, headers: {...(body || raw ? {'content-type': 'application/json'} : {}), ...headers}, body: raw ?? (body ? JSON.stringify(body) : undefined)}),
  e, asUser(user));
const put = (e, baseVersion, p = plan(), user) => call(e, 'PUT', {body: {baseVersion, plan: p}, user});

test('requests without a verified identity are rejected', async () => {
  const res = await handle(new Request('https://lounge.test/api/trip/plan'), env(), {verify: async () => null});
  assert.equal(res.status, 401);
});

test('only listed editors may read or write; the list is case-insensitive', async () => {
  const e = env();
  assert.equal((await call(e, 'GET', {user: 'friend@example.test'})).status, 403);
  assert.equal((await put(e, 0, plan(), 'friend@example.test')).status, 403);
  assert.equal((await call(e, 'GET', {user: 'partner@example.test'})).status, 200);
  assert.equal((await handle(new Request('https://lounge.test/api/trip/plan'), {...e, TRIP_EDITORS: ''}, asUser('me@example.test'))).status, 403, 'empty list denies everyone');
});

test('empty store reports version 0, then create and read back', async () => {
  const e = env();
  const empty = await (await call(e, 'GET')).json();
  assert.deepEqual([empty.version, empty.plan], [0, null]);
  const created = await (await put(e, 0)).json();
  assert.equal(created.version, 1);
  const got = await (await call(e, 'GET')).json();
  assert.equal(got.version, 1);
  assert.equal(got.updatedBy, 'me@example.test');
  assert.deepEqual(got.plan, plan());
});

test('updates increment the version and ?since avoids resending the plan', async () => {
  const e = env();
  await put(e, 0);
  const v2 = await (await put(e, 1, plan({end: '2027-01-16'}), 'partner@example.test')).json();
  assert.equal(v2.version, 2);
  const same = await (await call(e, 'GET', {query: '?since=2'})).json();
  assert.deepEqual(same, {version: 2, unchanged: true});
  const stale = await (await call(e, 'GET', {query: '?since=1'})).json();
  assert.equal(stale.plan.end, '2027-01-16');
});

test('a stale baseVersion is a 409 that returns the current plan and changes nothing', async () => {
  const e = env();
  await put(e, 0);
  await put(e, 1, plan({end: '2027-01-16'}), 'partner@example.test');
  const res = await put(e, 1, plan({end: '2027-01-20'}));
  assert.equal(res.status, 409);
  const {current} = await res.json();
  assert.equal(current.version, 2);
  assert.equal(current.plan.end, '2027-01-16');
  assert.equal((await (await call(e, 'GET')).json()).plan.end, '2027-01-16');
  assert.equal((await put(e, 0)).status, 409, 'creating over an existing plan is also a conflict');
});

test('two simultaneous writes from the same version: exactly one wins', async () => {
  const e = env();
  await put(e, 0);
  const results = await Promise.all([put(e, 1, plan({end: '2027-01-17'})), put(e, 1, plan({end: '2027-01-18'}), 'partner@example.test')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('history keeps each saved version', async () => {
  const e = env();
  await put(e, 0);
  await put(e, 1, plan({end: '2027-01-16'}));
  const {results} = await e.DB.prepare('SELECT version FROM trip_history ORDER BY version').all();
  assert.deepEqual(results.map(r => r.version), [1, 2]);
});

test('bad requests are refused without touching the plan', async () => {
  const e = env();
  assert.equal((await call(e, 'PUT', {raw: '{nope'})).status, 400);
  assert.equal((await call(e, 'PUT', {body: {baseVersion: -1, plan: plan()}})).status, 400);
  assert.equal((await call(e, 'PUT', {body: {baseVersion: 'x', plan: plan()}})).status, 400);
  assert.equal((await put(e, 0, plan({version: 2}))).status, 400);
  assert.equal((await put(e, 0, plan({items: [{id: 1}]}))).status, 400);
  assert.equal((await put(e, 0, plan({start: 'tomorrow'}))).status, 400);
  assert.equal((await put(e, 0, plan({items: Array.from({length: 181}, (_, i) => ({id: 'a' + i, type: 'activity', title: 'x', start: 0, days: 1}))}))).status, 400);
  assert.equal((await call(e, 'PUT', {body: {baseVersion: 0, plan: plan({pad: 'x'.repeat(300_000)})}})).status, 413);
  assert.equal((await call(e, 'PUT', {raw: JSON.stringify({baseVersion: 0, plan: plan()}), headers: {'content-type': 'text/plain'}})).status, 415);
  assert.equal((await call(e, 'PUT', {body: {baseVersion: 0, plan: plan()}, headers: {Origin: 'https://evil.test'}})).status, 403);
  assert.equal((await call(e, 'PUT', {body: {baseVersion: 0, plan: plan()}, headers: {Origin: 'https://lounge.test'}})).status, 200);
  assert.equal(checkPlan(plan()), null);
});

test('only the plan route and methods exist; responses are never cached', async () => {
  const e = env();
  assert.equal((await handle(new Request('https://lounge.test/api/trip/other'), e, asUser('me@example.test'))).status, 404);
  assert.equal((await call(e, 'DELETE')).status, 405);
  assert.equal((await call(e, 'GET')).headers.get('cache-control'), 'no-store');
});

// ---------------------------------------------------------------- Access JWT

const b64 = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
async function keyPair() {
  const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  return {pair, jwk: {...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig'}};
}
async function sign(pair, payload, header = {alg: 'RS256', kid: 'k1'}) {
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data))).toString('base64url');
  return `${data}.${sig}`;
}
const NOW = 1_800_000_000_000;
const good = (team, extra = {}) => ({iss: `https://${team}.cloudflareaccess.com`, aud: ['aud-123'], exp: NOW / 1000 + 600, email: 'Me@Example.test', ...extra});
async function verifyWith(team, token, keys, e = {}) {
  const request = new Request('https://lounge.test/api/trip/plan', {headers: token ? {'Cf-Access-Jwt-Assertion': token} : {}});
  return verifyAccess(request, {ACCESS_TEAM: team, ACCESS_AUD: 'aud-123', ...e}, {now: NOW, fetcher: async () => new Response(JSON.stringify({keys}))});
}

test('a correctly signed Access token yields the lower-cased email', async () => {
  const {pair, jwk} = await keyPair();
  assert.equal(await verifyWith('t-ok', await sign(pair, good('t-ok')), [jwk]), 'me@example.test');
});

test('forged, expired, mis-targeted and malformed tokens are rejected', async () => {
  const {pair, jwk} = await keyPair();
  const other = await keyPair();
  assert.equal(await verifyWith('t-forged', await sign(other.pair, good('t-forged')), [jwk]), null, 'signed by a different key');
  assert.equal(await verifyWith('t-exp', await sign(pair, good('t-exp', {exp: NOW / 1000 - 1})), [jwk]), null, 'expired');
  assert.equal(await verifyWith('t-aud', await sign(pair, good('t-aud', {aud: ['someone-else']})), [jwk]), null, 'wrong audience');
  assert.equal(await verifyWith('t-iss', await sign(pair, good('t-iss', {iss: 'https://evil.cloudflareaccess.com'})), [jwk]), null, 'wrong issuer');
  assert.equal(await verifyWith('t-alg', await sign(pair, good('t-alg'), {alg: 'none', kid: 'k1'}), [jwk]), null, 'alg none');
  assert.equal(await verifyWith('t-kid', await sign(pair, good('t-kid'), {alg: 'RS256', kid: 'unknown'}), [jwk]), null, 'unknown key id');
  assert.equal(await verifyWith('t-none', null, [jwk]), null, 'no header');
  assert.equal(await verifyWith('t-junk', 'not.a.jwt', [jwk]), null, 'garbage');
  const token = await sign(pair, good('t-tamper'));
  const [h, , s] = token.split('.');
  assert.equal(await verifyWith('t-tamper', `${h}.${b64(good('t-tamper', {email: 'evil@example.test'}))}.${s}`, [jwk]), null, 'payload tampered');
  assert.equal(await verifyWith('t-cfg', await sign(pair, good('t-cfg')), [jwk], {ACCESS_AUD: ''}), null, 'unconfigured audience');
});
