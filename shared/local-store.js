// ═══════════════════════════════════════════════
// LOCAL STORE — a tiny fake Firestore for dev/demo use before a real
// Firebase project exists (see shared/firebase-config.js).
//
// Mirrors the same shape as shared/firestore-store.js: collection(path)
// returns { onChange, add, update, set, remove }. Anything built against
// this file works unchanged once real Firestore is wired in — only
// shared/data-store.js needs to know which one is active.
//
// Persistence: localStorage, one JSON blob per collection path, so admin
// edits survive a page reload during development. Not multi-tab-realtime
// (unlike real Firestore) — onChange fires within the same tab only.
// ═══════════════════════════════════════════════

const STORAGE_PREFIX = 'scorecard:local:';
let seq = 0;

function nextId() {
  seq += 1;
  return `local_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 7)}`;
}

function storageKey(path) {
  return STORAGE_PREFIX + path;
}

function loadCollection(path) {
  const raw = localStorage.getItem(storageKey(path));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[local-store] corrupt data for', path, '— resetting', e);
    return {};
  }
}

function saveCollection(path, docsById) {
  localStorage.setItem(storageKey(path), JSON.stringify(docsById));
}

// In-memory cache of { path: { id: doc } } so repeated collection(path)
// calls share state within a page load without re-reading localStorage
// on every operation.
const cache = new Map();
const listeners = new Map(); // path -> Set<callback>

function getCache(path) {
  if (!cache.has(path)) cache.set(path, loadCollection(path));
  return cache.get(path);
}

function notify(path) {
  const subs = listeners.get(path);
  if (!subs) return;
  const snapshot = list(path);
  subs.forEach(cb => cb(snapshot));
}

function list(path) {
  const docsById = getCache(path);
  return Object.keys(docsById)
    .map(id => ({ id, ...docsById[id] }))
    .sort((a, b) => (a.__seq ?? 0) - (b.__seq ?? 0));
}

function add(path, data) {
  const docsById = getCache(path);
  const id = data.__id || nextId();
  seq += 1;
  docsById[id] = { ...data, __seq: seq };
  delete docsById[id].__id;
  saveCollection(path, docsById);
  notify(path);
  return id;
}

function update(path, id, patch) {
  const docsById = getCache(path);
  if (!docsById[id]) throw new Error(`[local-store] update: no doc ${id} in ${path}`);
  docsById[id] = { ...docsById[id], ...patch };
  saveCollection(path, docsById);
  notify(path);
}

// Upsert by explicit id — creates the doc if missing, merges if present.
// Used for fixed-id "singleton" docs (settings/trip, teams/red, teams/blue)
// where the admin might edit before the doc has ever been created.
function setDoc_(path, id, patch) {
  const docsById = getCache(path);
  const existing = docsById[id];
  docsById[id] = existing ? { ...existing, ...patch } : { ...patch, __seq: (++seq) };
  saveCollection(path, docsById);
  notify(path);
}

function remove(path, id) {
  const docsById = getCache(path);
  delete docsById[id];
  saveCollection(path, docsById);
  notify(path);
}

function onChange(path, cb) {
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path).add(cb);
  cb(list(path)); // fire immediately with current state, like Firestore's onSnapshot
  return () => listeners.get(path).delete(cb);
}

// Seeds a collection only if it's currently empty. Used once at app start
// (see shared/data-store.js) so a first-time visitor sees realistic demo
// data instead of a blank dashboard, without ever clobbering edits made
// on a prior visit.
function seedIfEmpty(path, docs) {
  const docsById = getCache(path);
  if (Object.keys(docsById).length > 0) return;
  docs.forEach(d => add(path, d));
}

// Public interface — deliberately matches shared/firestore-store.js exactly
// (onChange as the sole read path, mutators return Promises) so section
// code and data-store.js never need to know which one is active.
export function localCollection(path) {
  return {
    onChange: (cb) => onChange(path, cb),
    add: (data) => Promise.resolve(add(path, data)),
    update: (id, patch) => Promise.resolve(update(path, id, patch)),
    set: (id, patch) => Promise.resolve(setDoc_(path, id, patch)),
    remove: (id) => Promise.resolve(remove(path, id)),
  };
}

export function localSeedIfEmpty(path, docs) {
  seedIfEmpty(path, docs);
}
