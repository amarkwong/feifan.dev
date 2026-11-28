// Lounge trip planner: shared plan API (Cloudflare Worker + D1).
//
// Route:   <lounge host>/api/trip/plan   (GET, PUT)
// Auth:    Cloudflare Access already gates the hostname; this Worker still verifies
//          the signed JWT (signature, issuer, audience, expiry) and then requires the
//          caller's email to be in TRIP_EDITORS. Everything else is denied, so other
//          invited Lounge friends cannot read or change the plan.
// Writes:  optimistic concurrency. PUT {baseVersion, plan} succeeds only if the stored
//          version still equals baseVersion (atomic UPDATE ... WHERE version = ?);
//          otherwise 409 with the current plan so the client can resolve the conflict.
// Bindings: DB (D1), ACCESS_TEAM, ACCESS_AUD, TRIP_EDITORS (comma-separated emails).
//
// This file must stay self-contained: Terraform uploads it as a single module.

const MAX_BYTES = 256 * 1024;
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

// ------------------------------------------------------------------- Handler

export async function handle(request, env, {verify = verifyAccess} = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/trip/plan') return json({error: 'Not found'}, 404);
  if (!['GET', 'PUT'].includes(request.method)) return json({error: 'Method not allowed'}, 405, {allow: 'GET, PUT'});

  const email = await verify(request, env);
  if (!email) return json({error: 'Sign in through the Lounge'}, 401);
  const editors = (env.TRIP_EDITORS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!editors.includes(email)) return json({error: 'This plan is private'}, 403);

  const db = env.DB;
  await ensureSchema(db);

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

  const now = new Date().toISOString(), stored = JSON.stringify(plan), next = baseVersion + 1;
  const result = baseVersion === 0
    ? await db.prepare("INSERT OR IGNORE INTO trip_plan (id, version, plan, updated_by, updated_at) VALUES ('main', 1, ?, ?, ?)").bind(stored, email, now).run()
    : await db.prepare("UPDATE trip_plan SET version = ?, plan = ?, updated_by = ?, updated_at = ? WHERE id = 'main' AND version = ?").bind(next, stored, email, now, baseVersion).run();
  if (!result.meta.changes) return json({error: 'conflict', current: view(await readRow(db))}, 409);

  // Keep recent versions for recovery. Best effort: never fail a saved write.
  try {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO trip_history (version, plan, updated_by, updated_at) VALUES (?, ?, ?, ?)').bind(next, stored, email, now),
      db.prepare('DELETE FROM trip_history WHERE version <= ?').bind(next - HISTORY),
    ]);
  } catch { /* history is a convenience */ }
  return json({version: next, updatedBy: email, updatedAt: now});
}

export default {
  fetch: (request, env) => handle(request, env),
};
