// Lounge trip planner: shared plan API (Cloudflare Worker + D1).
//
// Routes:  <lounge host>/api/trip/plan          GET, PUT   the shared plan
//          <lounge host>/api/trip/flight        GET        flight-number lookup (AeroDataBox)
//          <lounge host>/api/trip/hotel-photos  GET        free-licensed photo candidates (Wikipedia/Commons)
// Auth:    Cloudflare Access already gates the hostname; this Worker still verifies
//          the signed JWT (signature, issuer, audience, expiry) and then requires the
//          caller's email to be in TRIP_EDITORS. Everything else is denied, so other
//          invited Lounge friends cannot read or change the plan.
// Writes:  optimistic concurrency. PUT {baseVersion, plan} succeeds only if the stored
//          version still equals baseVersion (atomic UPDATE ... WHERE version = ?);
//          otherwise 409 with the current plan so the client can resolve the conflict.
// Bindings: DB (D1), ACCESS_TEAM, ACCESS_AUD, TRIP_EDITORS (comma-separated emails).
//          Optional, for flight lookup: FLIGHT_API_KEY (secret), FLIGHT_API_GATEWAY
//          ('apimarket' default, or 'rapidapi'), FLIGHT_DAILY_CAP (default 5),
//          FLIGHT_MONTHLY_CAP (default 150). The key never leaves this Worker.
//
// This file must stay self-contained: Terraform uploads it as a single module.

const MAX_BYTES = 1024 * 1024; // plans may carry a few small resized hotel photos
const FLIGHT_TTL_MS = 24 * 3600 * 1000;
const MAX_CARDS = 180;
const HISTORY = 100;
const TYPES = ['country', 'city', 'activity', 'logistics'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  },
});

// ---------------------------------------------------------------- Access JWT

const b64urlToBytes = s => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), c => c.charCodeAt(0));
};
const decodePart = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

const certs = {team: '', at: 0, keys: []};
async function accessKeys(team, fetcher, now, refresh = false) {
  if (!refresh && certs.team === team && now - certs.at < 600_000) return certs.keys;
  const res = await fetcher(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access signing keys.');
  const {keys} = await res.json();
  Object.assign(certs, {team, at: now, keys});
  return keys;
}

/** Returns the verified, lower-cased email, or null. Never throws. */
export async function verifyAccess(request, env, {fetcher = fetch, now = Date.now()} = {}) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [h, p, s] = parts;
    const header = decodePart(h), payload = decodePart(p);
    if (header.alg !== 'RS256') return null;
    let jwk = (await accessKeys(env.ACCESS_TEAM, fetcher, now)).find(k => k.kid === header.kid);
    // A rotated key: refetch once, but not more than once a minute.
    if (!jwk && now - certs.at > 60_000) jwk = (await accessKeys(env.ACCESS_TEAM, fetcher, now, true)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return null;
    const t = Math.floor(now / 1000);
    if (payload.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
    if (![].concat(payload.aud || []).includes(env.ACCESS_AUD)) return null;
    if (!(payload.exp > t) || (payload.nbf && payload.nbf > t + 60)) return null;
    return typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- Storage

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS trip_plan (id TEXT PRIMARY KEY, version INTEGER NOT NULL, plan TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS trip_history (version INTEGER PRIMARY KEY, plan TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS flight_cache (cache_key TEXT PRIMARY KEY, flights TEXT NOT NULL, fetched_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS flight_usage (period TEXT PRIMARY KEY, calls INTEGER NOT NULL)',
];
const ready = new WeakMap();
function ensureSchema(db) {
  if (!ready.has(db)) {
    const p = db.batch(SCHEMA.map(sql => db.prepare(sql))).catch(error => { ready.delete(db); throw error; });
    ready.set(db, p);
  }
  return ready.get(db);
}
const readRow = db => db.prepare("SELECT version, plan, updated_by, updated_at FROM trip_plan WHERE id = 'main'").first();
const view = row => row
  ? {version: row.version, plan: JSON.parse(row.plan), updatedBy: row.updated_by, updatedAt: row.updated_at}
  : {version: 0, plan: null, updatedBy: null, updatedAt: null};

// ---------------------------------------------------------------- Validation

/** Structural check only; the browser runs the full itinerary validation. */
export function checkPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.version !== 1 || !DATE.test(plan.start) || !DATE.test(plan.end) || !Array.isArray(plan.items) || plan.items.length > MAX_CARDS) return 'The plan has an unexpected shape.';
  for (const x of plan.items) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !TYPES.includes(x.type) || typeof x.title !== 'string' || x.title.length > 120 || !Number.isFinite(x.start) || !Number.isFinite(x.days)) return 'A card in the plan is invalid.';
  }
  return null;
}

// ------------------------------------------------------------- Flight lookup

// Airline designators always contain a letter, so bare numbers such as "246" are not flight numbers.
const FLIGHT_NO = /^(?=[A-Z0-9]{0,1}[A-Z])[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const DAY_MS = 86400000;

// "2026-12-26 09:35+10:00" -> "2026-12-26T09:35" (local wall-clock time at the airport)
const localMinute = v => { const m = typeof v === 'string' && v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[1]}T${m[2]}` : null; };
const utcMs = v => (typeof v === 'string' ? Date.parse(v.replace(' ', 'T').replace(/Z?$/, 'Z')) : NaN);
function times(side) {
  const t = side?.scheduledTime;
  return {local: localMinute(t?.local ?? side?.scheduledTimeLocal), utc: utcMs(t?.utc ?? side?.scheduledTimeUtc)};
}
const place = side => ({iata: side?.airport?.iata ?? null, name: side?.airport?.name ?? null, city: side?.airport?.municipalityName ?? null, tz: side?.airport?.timeZone ?? null});

/**
 * AeroDataBox flight list -> the small shape the planner uses. Field names follow the public
 * AeroDataBox schema (departure/arrival.airport, scheduledTime.{local,utc}, airline, number);
 * they have not yet been checked against a recorded live response, so everything is read
 * defensively and entries missing airports or local times are dropped.
 */
export function normalizeFlights(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const f of raw) {
    const from = place(f?.departure), to = place(f?.arrival), dep = times(f?.departure), arr = times(f?.arrival);
    if (!from.iata || !to.iata || !dep.local || !arr.local) continue;
    const minutes = Math.round((arr.utc - dep.utc) / 60000);
    out.push({
      flightNo: String(f.number || '').replace(/\s+/g, '').toUpperCase() || null,
      airline: {name: f.airline?.name ?? null, iata: f.airline?.iata ?? null},
      from, to, departLocal: dep.local, arriveLocal: arr.local,
      durationMin: minutes >= 20 && minutes <= 1500 ? minutes : null,
      status: f.status ?? null, aircraft: f.aircraft?.model ?? null,
    });
    if (out.length === 4) break;
  }
  return out;
}

function flightRequest(env, no, date) {
  const path = `/flights/number/${encodeURIComponent(no)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`;
  if (env.FLIGHT_API_GATEWAY === 'rapidapi') {
    return {url: `https://aerodatabox.p.rapidapi.com${path}`, headers: {'X-RapidAPI-Key': env.FLIGHT_API_KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'}};
  }
  return {url: `https://prod.api.market/api/v1/aedbx/aerodatabox${path}`, headers: {'x-api-market-key': env.FLIGHT_API_KEY}};
}

// Atomic usage counters: the upsert only bumps while under the cap.
async function bump(db, period, cap) {
  if (!(cap >= 1)) return false;
  const r = await db.prepare('INSERT INTO flight_usage (period, calls) VALUES (?, 1) ON CONFLICT(period) DO UPDATE SET calls = calls + 1 WHERE calls < ?').bind(period, cap).run();
  return r.meta.changes > 0;
}
const refund = (db, period) => db.prepare('UPDATE flight_usage SET calls = MAX(calls - 1, 0) WHERE period = ?').bind(period).run();
async function quota(db, now, dailyCap, monthlyCap) {
  const iso = new Date(now).toISOString();
  const used = async period => (await db.prepare('SELECT calls FROM flight_usage WHERE period = ?').bind(period).first())?.calls ?? 0;
  return {today: Math.max(dailyCap - await used('d:' + iso.slice(0, 10)), 0), month: Math.max(monthlyCap - await used('m:' + iso.slice(0, 7)), 0)};
}

async function flightRoute(url, env, {fetcher, now}) {
  const no = (url.searchParams.get('no') || '').toUpperCase().replace(/\s+/g, '');
  const date = url.searchParams.get('date') || '';
  const when = Date.parse(date + 'T00:00:00Z');
  if (!FLIGHT_NO.test(no) || !DATE.test(date) || !Number.isFinite(when)) return json({error: 'Enter a flight number like SQ246 and a date.'}, 400);
  if (Math.abs(when - now) > 330 * DAY_MS) return json({error: 'That date is too far from today to look up.'}, 400);
  const db = env.DB, key = `${no}|${date}`;
  const dailyCap = Number(env.FLIGHT_DAILY_CAP ?? 5), monthlyCap = Number(env.FLIGHT_MONTHLY_CAP ?? 150);

  const hit = await db.prepare('SELECT flights, fetched_at FROM flight_cache WHERE cache_key = ?').bind(key).first();
  if (hit && now - Date.parse(hit.fetched_at) < FLIGHT_TTL_MS) {
    return json({flights: JSON.parse(hit.flights), source: 'cache', remaining: await quota(db, now, dailyCap, monthlyCap)});
  }
  if (!env.FLIGHT_API_KEY) return json({error: 'Flight lookup is not set up yet. Enter the details by hand.'}, 503);

  const iso = new Date(now).toISOString(), day = 'd:' + iso.slice(0, 10), month = 'm:' + iso.slice(0, 7);
  if (!await bump(db, month, monthlyCap)) return json({error: 'This month’s flight lookups are used up. Enter the details by hand.', remaining: await quota(db, now, dailyCap, monthlyCap)}, 429);
  if (!await bump(db, day, dailyCap)) { await refund(db, month); return json({error: 'Today’s flight lookups are used up. Try again tomorrow or enter the details by hand.', remaining: await quota(db, now, dailyCap, monthlyCap)}, 429); }

  let flights;
  try {
    const {url: target, headers} = flightRequest(env, no, date);
    const res = await fetcher(target, {headers, signal: AbortSignal.timeout(8000)});
    if (res.status === 204 || res.status === 404) flights = [];
    else if (res.ok) flights = normalizeFlights(await res.json());
    else return json({error: res.status === 429 ? 'The flight data service is busy. Try again later.' : 'The flight data service could not answer. Enter the details by hand.'}, 502);
  } catch {
    return json({error: 'The flight data service could not be reached.'}, 502);
  }
  if (flights.length) await db.prepare('INSERT OR REPLACE INTO flight_cache (cache_key, flights, fetched_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(flights), iso).run();
  return json({flights, source: 'live', remaining: await quota(db, now, dailyCap, monthlyCap)});
}

// ------------------------------------------------------------- Hotel photos

const FREE_LICENSE = /^(cc[ -]|cc0|public domain|pd[ -]|gfdl)/i;
const plain = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 80);

/** Candidate photos from Wikipedia's lead images, kept only when the file is on Commons under a free licence. */
export async function searchPhotos(query, fetcher) {
  const get = async url => { const r = await fetcher(url, {headers: {'User-Agent': 'LoungeTrip/1.0 (private itinerary planner)'}, signal: AbortSignal.timeout(8000)}); if (!r.ok) throw new Error('wiki'); return r.json(); };
  const found = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=${encodeURIComponent(query + ' hotel')}&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=480&pilimit=6`);
  const pages = (found?.query?.pages || [])
    .filter(p => p.thumbnail?.source?.startsWith('https://upload.wikimedia.org/wikipedia/commons/') && p.pageimage)
    .sort((a, b) => a.index - b.index);
  if (!pages.length) return [];
  const titles = pages.map(p => 'File:' + p.pageimage.replace(/_/g, ' '));
  const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata%7Curl&iiextmetadatafilter=LicenseShortName%7CArtist%7CNonFree&titles=${encodeURIComponent(titles.join('|'))}`);
  const meta = new Map((info?.query?.pages || []).filter(p => !p.missing && p.imageinfo?.[0]).map(p => [p.title, p.imageinfo[0]]));
  const out = [];
  for (const p of pages) {
    const file = meta.get('File:' + p.pageimage.replace(/_/g, ' '));
    const licence = plain(file?.extmetadata?.LicenseShortName?.value);
    if (!file || !FREE_LICENSE.test(licence) || String(file.extmetadata?.NonFree?.value).toLowerCase() === 'true') continue;
    out.push({
      title: p.title, src: p.thumbnail.source, width: p.thumbnail.width, height: p.thumbnail.height,
      license: licence, artist: plain(file.extmetadata?.Artist?.value) || 'Unknown author',
      page: String(file.descriptionurl || '').startsWith('https://commons.wikimedia.org/') ? file.descriptionurl : null,
    });
    if (out.length === 4) break;
  }
  return out;
}

async function photosRoute(url, {fetcher}) {
  const q = (url.searchParams.get('q') || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 80) return json({error: 'Type a hotel or brand name first.'}, 400);
  try {
    return json({candidates: await searchPhotos(q, fetcher)}, 200, {'cache-control': 'private, max-age=3600'});
  } catch {
    return json({error: 'Photo search is unavailable right now. You can upload your own photo.'}, 502);
  }
}

// ------------------------------------------------------------------- Handler

export async function handle(request, env, {verify = verifyAccess, fetcher = fetch, now = Date.now()} = {}) {
  const url = new URL(request.url);
  const route = {'/api/trip/plan': 'plan', '/api/trip/flight': 'flight', '/api/trip/hotel-photos': 'photos'}[url.pathname];
  if (!route) return json({error: 'Not found'}, 404);
  const methods = route === 'plan' ? ['GET', 'PUT'] : ['GET'];
  if (!methods.includes(request.method)) return json({error: 'Method not allowed'}, 405, {allow: methods.join(', ')});

  const email = await verify(request, env);
  if (!email) return json({error: 'Sign in through the Lounge'}, 401);
  const editors = (env.TRIP_EDITORS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!editors.includes(email)) return json({error: 'This plan is private'}, 403);

  if (route === 'photos') return photosRoute(url, {fetcher});
  const db = env.DB;
  await ensureSchema(db);
  if (route === 'flight') return flightRoute(url, env, {fetcher, now});

  if (request.method === 'GET') {
    const row = await readRow(db);
    const since = Number(url.searchParams.get('since'));
    if (row && Number.isInteger(since) && since === row.version) return json({version: row.version, unchanged: true});
    return json(view(row));
  }

  // PUT: browsers must be same-origin and send JSON (which forces a CORS preflight cross-site).
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({error: 'Cross-origin writes are not allowed'}, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({error: 'Send application/json'}, 415);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({error: 'The plan is too large'}, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({error: 'Invalid JSON'}, 400); }
  const {baseVersion, plan} = body || {};
  if (!Number.isInteger(baseVersion) || baseVersion < 0) return json({error: 'baseVersion must be a non-negative integer'}, 400);
  const problem = checkPlan(plan);
  if (problem) return json({error: problem}, 400);

  const saved = new Date(now).toISOString(), stored = JSON.stringify(plan), next = baseVersion + 1;
  const result = baseVersion === 0
    ? await db.prepare("INSERT OR IGNORE INTO trip_plan (id, version, plan, updated_by, updated_at) VALUES ('main', 1, ?, ?, ?)").bind(stored, email, saved).run()
    : await db.prepare("UPDATE trip_plan SET version = ?, plan = ?, updated_by = ?, updated_at = ? WHERE id = 'main' AND version = ?").bind(next, stored, email, saved, baseVersion).run();
  if (!result.meta.changes) return json({error: 'conflict', current: view(await readRow(db))}, 409);

  // Keep recent versions for recovery. Best effort: never fail a saved write.
  try {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO trip_history (version, plan, updated_by, updated_at) VALUES (?, ?, ?, ?)').bind(next, stored, email, saved),
      db.prepare('DELETE FROM trip_history WHERE version <= ?').bind(next - HISTORY),
    ]);
  } catch { /* history is a convenience */ }
  return json({version: next, updatedBy: email, updatedAt: saved});
}

export default {
  fetch: (request, env) => handle(request, env),
};
