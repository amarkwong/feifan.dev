// Local stand-in for the Lounge: static files from lounge/, the shared-plan Worker on
// /api/trip/plan backed by SQLite, and the response headers from lounge/_headers (so the
// real CSP is exercised). Development and tests only; it is never deployed.
//
//   node scripts/trip-dev-server.mjs            # http://127.0.0.1:8787/trip/
//   TRIP_DB=.trip-dev.sqlite node scripts/...   # keep the plan between runs
//
// Flight lookup and hotel-photo search use offline fakes (scripts/fake-upstreams.mjs) so
// nothing spends real API quota. To try the real services deliberately:
//   TRIP_LIVE_UPSTREAMS=1 FLIGHT_API_KEY=... [FLIGHT_API_GATEWAY=rapidapi] node scripts/trip-dev-server.mjs
//
// TRIP_NOW=2026-11-28T03:00:00Z pins the clock the Worker uses (tests do this).
//
// Identity: Cloudflare Access is replaced by the `x-dev-user` request header (default
// owner@local.test). That bypass lives only in this script; the Worker itself is unchanged.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handle} from '../infra/trip-worker.js';
import {sqliteD1} from './d1-sqlite.mjs';
import {fakeFetcher} from './fake-upstreams.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lounge');
const port = Number(process.env.PORT || 8787);
const editors = process.env.TRIP_EDITORS || 'owner@local.test,partner@local.test';
const db = sqliteD1(process.env.TRIP_DB || ':memory:');
const live = process.env.TRIP_LIVE_UPSTREAMS === '1';
const env = {
  DB: db, TRIP_EDITORS: editors,
  FLIGHT_API_KEY: live ? process.env.FLIGHT_API_KEY : 'dev-fake-key',
  FLIGHT_API_GATEWAY: process.env.FLIGHT_API_GATEWAY,
  FLIGHT_DAILY_CAP: live ? process.env.FLIGHT_DAILY_CAP : '1000', FLIGHT_MONTHLY_CAP: live ? process.env.FLIGHT_MONTHLY_CAP : '1000',
};
const fetcher = live ? fetch : fakeFetcher;
const verify = async request => (request.headers.get('x-dev-user') || 'owner@local.test').toLowerCase();

// Apply the first block of lounge/_headers (the `/*` rules) to every response.
const globalHeaders = {};
{
  let inGlobal = false;
  for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) inGlobal = line.trim() === '/*';
    else if (inGlobal && line.includes(':')) {
      const i = line.indexOf(':');
      globalHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
}
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon'};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/__dev/reset' && req.method === 'POST') {
      db.reset();
      res.writeHead(204).end();
      return;
    }
    if (url.pathname.startsWith('/api/trip/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
      const response = await handle(new Request(url, {method: req.method, headers: req.headers, body}), env, {verify, fetcher, now: process.env.TRIP_NOW ? Date.parse(process.env.TRIP_NOW) : Date.now()});
      res.writeHead(response.status, {...globalHeaders, ...Object.fromEntries(response.headers)});
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end('Forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404, globalHeaders).end('Not found'); return; }
    res.writeHead(200, {...globalHeaders, 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end('Server error');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Lounge dev server: http://127.0.0.1:${port}/trip/  (editors: ${editors}; upstreams: ${live ? 'LIVE' : 'offline fakes'})`));
