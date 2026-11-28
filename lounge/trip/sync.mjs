// Shared plan: keeps this browser's plan and the Lounge copy (/api/trip/plan) in step.
//
// - localStorage stays the working copy; every local save is pushed (debounced).
// - Writes carry the version they were based on; if the other person saved first the
//   server answers 409 and the user chooses a version. Choosing the shared one keeps
//   their own on the Undo stack.
// - A poll (and tab focus) picks up the other person's changes.
// - No API (plain static hosting), no access, or no network never breaks planning:
//   the page simply stays a local-only planner.
import {S, KEY, hooks, notify, persist} from './store.mjs';
import {validate} from './model.mjs';
import {$} from './util.mjs';

const API = '/api/trip/plan', META = 'homeward-studio-sync-v1', POLL_MS = 15000, PUSH_DELAY = 800;
const LABELS = {
  sync: 'Shared plan · saved', saving: 'Saving…', offline: 'Offline · saved on this device',
  denied: 'Saved on this device · not shared', conflict: 'Choose which version to keep', paused: 'Sync paused · saved on this device',
};

// mode: sync | offline | local (no API) | denied | conflict | paused (server refused the plan)
let mode = 'offline', connected = false, dirty = false, rev = 0, inflight = false, busy = false, deniedNotified = false;
let remote = {version: 0, updatedBy: null}, pushTimer = null, offered = null;

const readMeta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
const writeMeta = () => { try { localStorage.setItem(META, JSON.stringify({version: remote.version, dirty})); } catch { /* storage unavailable */ } };
const hasSavedLocalPlan = () => { try { return localStorage.getItem(KEY) !== null; } catch { return false; } };
const who = email => String(email || '').split('@')[0] || 'Your partner';
function show(kind) { const el = $('#saved'); el.textContent = LABELS[kind]; el.dataset.sync = kind; }
const fault = (kind, message) => Object.assign(new Error(message), {kind});

async function call(method, query = '', body) {
  let res;
  try {
    res = await fetch(API + query, {method, credentials: 'same-origin', cache: 'no-store', headers: body ? {'content-type': 'application/json'} : {}, body: body && JSON.stringify(body)});
  } catch { throw fault('offline', 'offline'); }
  if (res.status === 403) throw fault('denied', 'denied');
  if (res.status === 401 || res.status >= 500) throw fault('offline', 'unavailable');
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw fault('none', 'no API here');
  try { return {status: res.status, data: await res.json()}; } catch { throw fault('none', 'bad response'); }
}

function failed(error) {
  if (error.kind === 'denied') {
    mode = 'denied'; show('denied');
    if (!deniedNotified) { deniedNotified = true; notify('This plan isn’t shared with your account. Edits stay on this device.'); }
  } else if (error.kind === 'none') {
    mode = 'local'; const el = $('#saved'); el.textContent = 'Saved on this device'; delete el.dataset.sync;
  } else { mode = 'offline'; if (connected || dirty) show('offline'); }
}

function adopt(data, {keepHistory = false} = {}) {
  S.state = validate(structuredClone(data.plan));
  if (!keepHistory) S.history = [];
  remote = {version: data.version, updatedBy: data.updatedBy}; dirty = false;
  persist(true); writeMeta(); hooks.render();
}

function schedule(delay = PUSH_DELAY) { clearTimeout(pushTimer); pushTimer = setTimeout(push, delay); }

async function push() {
  if (inflight || !connected || mode === 'conflict' || mode === 'local' || mode === 'denied' || mode === 'paused') return;
  inflight = true;
  const sent = rev;
  show('saving');
  try {
    const {status, data} = await call('PUT', '', {baseVersion: remote.version, plan: S.state});
    if (status === 200) {
      remote = {version: data.version, updatedBy: data.updatedBy};
      if (sent === rev) dirty = false;
      mode = 'sync'; writeMeta(); show(dirty ? 'saving' : 'sync');
    } else if (status === 409) {
      inflight = false; conflict(data.current, 'edited'); return;
    } else {
      mode = 'paused'; show('paused'); notify(data.error || 'The shared plan could not be saved. Your changes are kept on this device.');
    }
  } catch (error) { failed(error); }
  inflight = false;
  if (mode === 'sync' && dirty) schedule(0);
}

function conflict(current, reason) {
  mode = 'conflict'; clearTimeout(pushTimer); offered = current; show('conflict');
  $('#sync-message').textContent = reason === 'first'
    ? 'A shared plan already exists, and this device has a different saved plan.'
    : `${who(current.updatedBy)} saved changes while you were editing.`;
  if (!$('#sync-dialog').open) $('#sync-dialog').showModal();
}

function useShared() {
  $('#sync-dialog').close();
  S.history.push(structuredClone(S.state)); if (S.history.length > 50) S.history.shift();
  try { adopt(offered, {keepHistory: true}); mode = 'sync'; show('sync'); notify('Shared plan loaded. Undo brings your version back.'); }
  catch { S.history.pop(); mode = 'paused'; show('paused'); notify('The shared plan could not be read, so your version was kept.'); }
}

function keepMine() {
  $('#sync-dialog').close();
  remote = {version: offered.version, updatedBy: offered.updatedBy}; mode = 'sync'; dirty = true; rev++;
  push();
}

async function connect() {
  const {status, data} = await call('GET');
  if (status !== 200) throw fault('none', 'unexpected status');
  const meta = readMeta(), known = meta.version !== undefined, hasEdits = dirty || meta.dirty;
  connected = true;
  if (data.version === 0) { remote = {version: 0, updatedBy: null}; mode = 'sync'; dirty = true; rev++; await push(); return; }
  if (JSON.stringify(S.state) === JSON.stringify(data.plan)) {
    remote = {version: data.version, updatedBy: data.updatedBy}; dirty = false; writeMeta(); mode = 'sync'; show('sync'); return;
  }
  if (hasEdits && known && meta.version === data.version) { remote = {version: data.version, updatedBy: data.updatedBy}; mode = 'sync'; dirty = true; rev++; await push(); return; }
  if (hasEdits || (!known && hasSavedLocalPlan())) { conflict(data, known ? 'edited' : 'first'); return; }
  adopt(data); mode = 'sync'; show('sync');
  if (known && meta.version !== data.version) notify(`Plan updated by ${who(data.updatedBy)}.`);
}

const editing = () => !!document.activeElement?.closest?.('#edit-form');
async function check() {
  if (!connected) return connect();
  if (dirty || inflight) { if (mode === 'offline') await push(); return; }
  const {status, data} = await call('GET', `?since=${remote.version}`);
  if (status !== 200) throw fault('none', 'unexpected status');
  if (data.unchanged) { mode = 'sync'; show('sync'); return; }
  if (editing()) return; // don't rebuild the inspector under someone's cursor; try next poll
  adopt(data); mode = 'sync'; show('sync');
  notify(`Plan updated by ${who(data.updatedBy)}.`);
}

async function poll() {
  if (document.hidden || busy || S.drag || document.querySelector('dialog[open]') || ['local', 'denied', 'paused', 'conflict'].includes(mode)) return;
  busy = true;
  try { await check(); } catch (error) { failed(error); } finally { busy = false; }
}

function persisted() {
  rev++; dirty = true;
  if (connected) writeMeta(); // before connecting, keep the previous session's marker intact
  if (['local', 'denied', 'paused', 'conflict'].includes(mode)) return;
  if (connected) show(mode === 'offline' ? 'offline' : 'saving');
  schedule();
}

export function initSync() {
  hooks.persisted = persisted;
  $('#sync-theirs').onclick = useShared;
  $('#sync-mine').onclick = keepMine;
  $('#sync-dialog').addEventListener('cancel', e => e.preventDefault()); // a choice is required
  document.addEventListener('visibilitychange', poll);
  window.addEventListener('online', poll);
  setInterval(poll, POLL_MS);
  busy = true;
  connect().catch(failed).finally(() => { busy = false; });
}
