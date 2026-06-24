// db.js — IndexedDB-wrapper. Gemmer sagen lokalt i browseren (data forlader ALDRIG maskinen).
// To stores: 'case' (én post: hele sagen) + 'files' (vedhæftede filer som Blobs).
import { Err } from './errors.js';
import { log } from './log.js';

const DB = 'caseboard';
const VER = 1;
let _db = null;

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('case')) db.createObjectStore('case');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    r.onsuccess = () => { _db = r.result; log.ok('db', 'åbnet'); res(_db); };
    r.onerror = () => rej(Err.db('kunne ikke åbne IndexedDB', r.error));
  });
}

const store = (name, mode) => _db.transaction(name, mode).objectStore(name);
const reqP = (q, errFn) => new Promise((res, rej) => {
  q.onsuccess = () => res(q.result);
  q.onerror = () => rej(errFn(q.error));
});

export const saveCase = (c) => reqP(store('case', 'readwrite').put(c, 'current'), (e) => Err.db('gem sag', e));
export const loadCase = () => reqP(store('case', 'readonly').get('current'), (e) => Err.db('hent sag', e));

// Filer: rec = { name, mime, blob }
export const putFile = (id, rec) => reqP(store('files', 'readwrite').put(rec, id), (e) => Err.file('gem fil', e));
export const getFile = (id) => reqP(store('files', 'readonly').get(id), (e) => Err.file('hent fil', e));
export const delFile = (id) => reqP(store('files', 'readwrite').delete(id), (e) => Err.file('slet fil', e));

export function allFiles() {
  return new Promise((res, rej) => {
    const out = {};
    const c = store('files', 'readonly').openCursor();
    c.onsuccess = (e) => { const cur = e.target.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
    c.onerror = () => rej(Err.file('list filer', c.error));
  });
}

export function clearAll() {
  return new Promise((res, rej) => {
    const t = _db.transaction(['case', 'files'], 'readwrite');
    t.objectStore('case').clear();
    t.objectStore('files').clear();
    t.oncomplete = () => res();
    t.onerror = () => rej(Err.db('ryd alt', t.error));
  });
}
