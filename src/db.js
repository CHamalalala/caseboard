// db.js — IndexedDB-wrapper. Multi-sag. Data forlader ALDRIG maskinen.
// Stores: 'cases' (én post pr. sag, keyet på case.id) · 'files' (Blobs) · 'app' (app-tilstand, fx currentCaseId).
// 'case' (gammel enkelt-sag fra v1) beholdes så vi kan migrere den til 'cases'.
import { Err } from './errors.js';
import { log } from './log.js';

const DB = 'caseboard';
const VER = 2;
let _db = null;

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('cases')) db.createObjectStore('cases');   // key = case.id
      if (!db.objectStoreNames.contains('app')) db.createObjectStore('app');        // key = string
      // 'case' (v1) bevares automatisk hvis den findes — bruges kun til migration.
    };
    r.onsuccess = () => { _db = r.result; log.ok('db', 'åbnet (v' + VER + ')'); res(_db); };
    r.onerror = () => rej(Err.db('kunne ikke åbne IndexedDB', r.error));
  });
}

const store = (name, mode) => _db.transaction(name, mode).objectStore(name);
const reqP = (q, errFn) => new Promise((res, rej) => {
  q.onsuccess = () => res(q.result);
  q.onerror = () => rej(errFn(q.error));
});

// ---- sager ----
export const saveCaseRec = (c) => reqP(store('cases', 'readwrite').put(c, c.id), (e) => Err.db('gem sag', e));
export const getCase = (id) => reqP(store('cases', 'readonly').get(id), (e) => Err.db('hent sag', e));
export const delCaseRec = (id) => reqP(store('cases', 'readwrite').delete(id), (e) => Err.db('slet sag', e));
export function listCases() {
  return new Promise((res, rej) => {
    const out = [];
    const c = store('cases', 'readonly').openCursor();
    c.onsuccess = (e) => { const cur = e.target.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); };
    c.onerror = () => rej(Err.db('list sager', c.error));
  });
}

// ---- app-tilstand ----
export const getState = (k) => reqP(store('app', 'readonly').get(k), (e) => Err.db('hent state', e));
export const setState = (k, v) => reqP(store('app', 'readwrite').put(v, k), (e) => Err.db('gem state', e));

// ---- filer: rec = { name, mime, blob } ----
export const putFile = (id, rec) => reqP(store('files', 'readwrite').put(rec, id), (e) => Err.file('gem fil', e));
export const getFile = (id) => reqP(store('files', 'readonly').get(id), (e) => Err.file('hent fil', e));
export const delFile = (id) => reqP(store('files', 'readwrite').delete(id), (e) => Err.file('slet fil', e));

// ---- migration fra v1 (enkelt-sag i 'case'-store på nøglen 'current') ----
export function getLegacyCase() {
  if (!_db.objectStoreNames.contains('case')) return Promise.resolve(null);
  return reqP(store('case', 'readonly').get('current'), (e) => Err.db('læs gammel sag', e));
}
export function clearLegacy() {
  if (!_db.objectStoreNames.contains('case')) return Promise.resolve();
  return reqP(store('case', 'readwrite').clear(), (e) => Err.db('ryd gammel', e));
}
