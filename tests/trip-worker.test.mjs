import test from 'node:test';
import assert from 'node:assert/strict';
import {handle, verifyAccess, checkPlan, normalizeFlights} from '../infra/trip-worker.js';
import {fakeFetcher, calls, flightBody} from '../scripts/fake-upstreams.mjs';
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
  assert.equal((await call(e, 'PUT', {body: {baseVersion: 0, plan: plan({pad: 'x'.repeat(1_100_000)})}})).status, 413);
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

// ------------------------------------------------------- Flight lookup (offline)

const TODAY = Date.parse('2026-11-28T03:00:00Z');
const flightEnv = (extra = {}) => ({...env(), FLIGHT_API_KEY: 'test-key-not-real', ...extra});
const lookup = (e, no, date, {user = 'me@example.test', fetcher = fakeFetcher, gateway} = {}) => handle(
  new Request(`https://lounge.test/api/trip/flight?no=${no}&date=${date}`), gateway ? {...e, FLIGHT_API_GATEWAY: gateway} : e, {verify: async () => user, fetcher, now: TODAY});

test('flight lookup returns a normalised flight with a true elapsed duration', async () => {
  calls.flight = 0;
  const res = await lookup(flightEnv(), 'SQ246', '2026-12-26');
  assert.equal(res.status, 200);
  const {flights, source, remaining} = await res.json();
  assert.equal(source, 'live');
  assert.deepEqual(flights[0], {
    flightNo: 'SQ246', airline: {name: 'Singapore Airlines', iata: 'SQ'},
    from: {iata: 'BNE', name: 'Brisbane', city: 'Brisbane', tz: 'Australia/Brisbane'},
    to: {iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', tz: 'Asia/Singapore'},
    departLocal: '2026-12-26T09:35', arriveLocal: '2026-12-26T15:20', durationMin: 465, status: 'Expected', aircraft: 'Airbus A350-900',
  });
  assert.deepEqual(remaining, {today: 4, month: 149});
  assert.equal(calls.flight, 1);
});

test('a repeated lookup is served from the cache without using quota', async () => {
  calls.flight = 0;
  const e = flightEnv();
  await lookup(e, 'SQ246', '2026-12-26');
  const again = await (await lookup(e, 'sq 246', '2026-12-26')).json();
  assert.equal(again.source, 'cache');
  assert.deepEqual(again.remaining, {today: 4, month: 149});
  assert.equal(calls.flight, 1, 'only one upstream call');
});

test('daily and monthly caps stop upstream calls and refund the other counter', async () => {
  calls.flight = 0;
  const e = flightEnv({FLIGHT_DAILY_CAP: '2', FLIGHT_MONTHLY_CAP: '10'});
  assert.equal((await lookup(e, 'SQ246', '2026-12-26')).status, 200);
  assert.equal((await lookup(e, 'CZ306', '2026-12-27')).status, 200);
  const blocked = await lookup(e, 'SQ246', '2026-12-28');
  assert.equal(blocked.status, 429);
  assert.equal(calls.flight, 2, 'no third upstream call');
  assert.deepEqual((await blocked.json()).remaining, {today: 0, month: 8}, 'monthly counter was refunded');
  const m = flightEnv({FLIGHT_DAILY_CAP: '5', FLIGHT_MONTHLY_CAP: '1'});
  await lookup(m, 'SQ246', '2026-12-26');
  assert.equal((await lookup(m, 'CZ306', '2026-12-27')).status, 429);
});

test('flight lookup refuses bad input, missing config, and non-editors without spending quota', async () => {
  calls.flight = 0;
  const e = flightEnv();
  for (const q of [['', '2026-12-26'], ['SQ246;', '2026-12-26'], ['SQ246', 'soon'], ['SQ246', '2030-01-01'], ['SQ246', '2020-01-01']]) {
    assert.equal((await lookup(e, q[0], q[1])).status, 400, q.join(' '));
  }
  assert.equal((await lookup(env(), 'SQ246', '2026-12-26')).status, 503, 'no key configured');
  assert.equal((await lookup(e, 'SQ246', '2026-12-26', {user: 'friend@example.test'})).status, 403);
  assert.equal(calls.flight, 0);
  assert.equal((await handle(new Request('https://lounge.test/api/trip/flight?no=SQ246&date=2026-12-26', {method: 'POST'}), e, {verify: async () => 'me@example.test'})).status, 405);
});

test('unknown flights return an empty list and are not cached; provider errors do not leak the key', async () => {
  const e = flightEnv();
  const none = await (await lookup(e, 'XX999', '2026-12-26')).json();
  assert.deepEqual(none.flights, []);
  const {results} = await e.DB.prepare('SELECT * FROM flight_cache').all();
  assert.equal(results.length, 0);
  const failing = async () => new Response('boom test-key-not-real', {status: 500});
  const bad = await lookup(e, 'SQ246', '2026-12-26', {fetcher: failing});
  assert.equal(bad.status, 502);
  assert.ok(!(await bad.text()).includes('test-key-not-real'));
  const thrown = await lookup(e, 'SQ246', '2026-12-27', {fetcher: async () => { throw new Error('socket test-key-not-real'); }});
  assert.equal(thrown.status, 502);
  assert.ok(!(await thrown.text()).includes('test-key-not-real'));
});

test('the key is sent only to the provider, in the header for the chosen gateway', async () => {
  const seen = [];
  const spy = async (url, init) => { seen.push({url: String(url), headers: init.headers}); return fakeFetcher(url, init); };
  await lookup(flightEnv(), 'SQ246', '2026-12-26', {fetcher: spy});
  await lookup(flightEnv(), 'CZ306', '2026-12-26', {fetcher: spy, gateway: 'rapidapi'});
  assert.match(seen[0].url, /^https:\/\/prod\.api\.market\/api\/v1\/aedbx\/aerodatabox\/flights\/number\/SQ246\/2026-12-26/);
  assert.equal(seen[0].headers['x-api-market-key'], 'test-key-not-real');
  assert.match(seen[1].url, /^https:\/\/aerodatabox\.p\.rapidapi\.com\//);
  assert.equal(seen[1].headers['X-RapidAPI-Key'], 'test-key-not-real');
  assert.ok(!seen.some(s => s.url.includes('test-key-not-real')), 'never in the URL');
});

test('normaliser copes with the older field names and drops unusable entries', () => {
  const [one] = flightBody('SQ246', '2026-12-26');
  const old = structuredClone(one);
  for (const side of [old.departure, old.arrival]) { side.scheduledTimeLocal = side.scheduledTime.local; side.scheduledTimeUtc = side.scheduledTime.utc; delete side.scheduledTime; }
  assert.equal(normalizeFlights([old])[0].durationMin, 465);
  assert.equal(normalizeFlights([{...one, departure: {...one.departure, airport: {}}}]).length, 0);
  assert.equal(normalizeFlights([{...one, arrival: {airport: one.arrival.airport}}]).length, 0);
  assert.deepEqual(normalizeFlights(null), []);
  const noUtc = structuredClone(one); delete noUtc.departure.scheduledTime.utc;
  assert.equal(normalizeFlights([noUtc])[0].durationMin, null, 'no guessed duration without UTC times');
});

// ------------------------------------------------------ Hotel photos (offline)

const photos = (e, q, {user = 'me@example.test', fetcher = fakeFetcher} = {}) => handle(
  new Request(`https://lounge.test/api/trip/hotel-photos?q=${encodeURIComponent(q)}`), e, {verify: async () => user, fetcher});

test('photo search keeps only freely licensed Commons images from Wikimedia hosts', async () => {
  const res = await photos(env(), 'Park Hyatt Tokyo');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, max-age=3600');
  const {candidates} = await res.json();
  assert.equal(candidates.length, 1, 'non-free logo and off-host image are dropped');
  assert.deepEqual(candidates[0], {
    title: 'Park Hyatt Tokyo', src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Park_Hyatt_Tokyo.jpg/480px-Park_Hyatt_Tokyo.jpg',
    width: 480, height: 320, license: 'CC BY-SA 4.0', artist: 'Jane Doe & Co', page: 'https://commons.wikimedia.org/wiki/File:Park_Hyatt_Tokyo.jpg',
  });
  assert.deepEqual((await (await photos(env(), 'Nowhere Inn')).json()).candidates, []);
});

test('photo search validates input, requires an editor, and degrades when Wikipedia fails', async () => {
  assert.equal((await photos(env(), 'x')).status, 400);
  assert.equal((await photos(env(), 'y'.repeat(81))).status, 400);
  assert.equal((await photos(env(), 'Park Hyatt', {user: 'friend@example.test'})).status, 403);
  const down = await photos(env(), 'Park Hyatt', {fetcher: async () => new Response('x', {status: 503})});
  assert.equal(down.status, 502);
});
