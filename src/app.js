// app.js — controller: multi-sag + navigation (Hjem / Mine sager / Tilbage) + sags-detalje.
import { log } from './log.js';
import { Err, AppError } from './errors.js';
import * as db from './db.js';
import { newCase, newEvent, newSummary, sortEvents, daDate, TYPES, today, uid } from './model.js';
import { el, toast, insertModal } from './ui.js';

const root = () => document.getElementById('app');
const state = { view: 'home', case: null, cases: [], history: [] };

// ---------- fil-hjælpere ----------
const blobToB64 = (blob) => new Promise((res) => {
  const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob);
});
const b64ToBlob = (b64, mime) => {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
};
const caseFileIds = (c) => {
  const ids = new Set();
  for (const ev of c.events || []) for (const a of ev.attachments || []) if (a.fileId) ids.add(a.fileId);
  return [...ids];
};
function fail(e) {
  const a = e instanceof AppError ? `${e.code}: ${e.message}` : (e?.message || e);
  log.err('app', a, e); toast('Fejl — ' + a, 'err');
}
// gem den åbne sag (auto-gem ved hver ændring)
const save = () => { if (!state.case) return Promise.resolve(); state.case.updated = Date.now(); return db.saveCaseRec(state.case).catch(fail); };

// ---------- navigation ----------
function renderRoute() { state.view === 'case' ? renderCase() : renderHome(); }
async function refreshCases() { state.cases = await db.listCases(); }
async function navHome() { state.history = []; state.view = 'home'; state.case = null; await refreshCases(); renderHome(); }
async function openCaseById(id) {
  const c = await db.getCase(id);
  if (!c) return toast('Sagen blev ikke fundet', 'warn');
  state.history.push('home'); state.view = 'case'; state.case = c; renderCase();
}
function openCaseObj(c) { state.history.push('home'); state.view = 'case'; state.case = c; renderCase(); }
function back() { state.history.pop(); navHome(); }

// ---------- sags-handlinger ----------
async function createCase() {
  const c = newCase('Ny sag'); await db.saveCaseRec(c); await refreshCases();
  openCaseObj(c); toast('Ny sag oprettet', 'ok');
}
async function deleteCase(id) {
  const c = await db.getCase(id);
  if (!c) return;
  if (!confirm(`Slet sagen “${c.title}” permanent? (Eksportér først hvis du vil beholde en kopi.)`)) return;
  for (const fid of caseFileIds(c)) await db.delFile(fid);
  await db.delCaseRec(id); await refreshCases(); renderHome();
  toast('Sag slettet', 'ok');
}

async function addEventFromModal() {
  const data = await insertModal({ TYPES, today });
  if (!data) return;
  const attachments = [];
  if (data.file) {
    const id = uid('file');
    await db.putFile(id, { name: data.file.name, mime: data.file.type, blob: data.file });
    attachments.push({ fileId: id, name: data.file.name });
  }
  state.case.events.push(newEvent({ ...data, attachments }));
  await save(); renderCase();
  toast('Bevis indsat på ' + daDate(data.date), 'ok');
}

async function openFile(fileId) {
  try {
    const rec = await db.getFile(fileId);
    if (!rec) return toast('Filen blev ikke fundet', 'warn');
    const url = URL.createObjectURL(rec.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { fail(e); }
}

function patch(obj, key, val) { obj[key] = val; save(); }
function addSummary() { state.case.summaries.unshift(newSummary()); save(); renderCase(); }
function linkToSummary(summaryId, ref) {
  const s = state.case.summaries.find((x) => x.id === summaryId);
  if (s && !s.links.some((l) => l.refId === ref.refId)) { s.links.push(ref); save(); renderCase(); }
}

// ---------- eksport / import ----------
async function exportCaseObj(c) {
  try {
    const out = { app: 'caseboard', exported: new Date().toISOString(), case: c, files: {} };
    for (const fid of caseFileIds(c)) {
      const rec = await db.getFile(fid);
      if (rec) out.files[fid] = { name: rec.name, mime: rec.mime, b64: await blobToB64(rec.blob) };
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: (c.title || 'sag').replace(/\s+/g, '-') + '.caseboard.json' });
    a.click();
    toast('Sag eksporteret', 'ok');
  } catch (e) { fail(Err.export('eksport fejlede', e)); }
}
async function exportCaseById(id) { const c = await db.getCase(id); if (c) exportCaseObj(c); }

async function importData(data) {
  if (!data || !data.case) throw Err.import('ikke en gyldig CaseBoard-fil');
  const c = data.case;
  c.id = uid('case'); c.updated = Date.now();           // ny id => kolliderer aldrig med eksisterende sager
  const remap = {};
  for (const [oldId, f] of Object.entries(data.files || {})) {
    const nid = uid('file'); remap[oldId] = nid;
    await db.putFile(nid, { name: f.name, mime: f.mime, blob: b64ToBlob(f.b64, f.mime) });
  }
  for (const ev of c.events || []) ev.attachments = (ev.attachments || []).map((a) => ({ ...a, fileId: remap[a.fileId] || a.fileId }));
  await db.saveCaseRec(c); await refreshCases();
  openCaseObj(c);
  toast('Sag importeret: ' + (c.title || ''), 'ok');
}
async function importCase(file) {
  try { await importData(JSON.parse(await file.text())); }
  catch (e) { fail(e instanceof AppError ? e : Err.import('import fejlede', e)); }
}

// Fiktiv demo (INGEN rigtige sags-data) — sikkert at hoste offentligt.
async function loadDemo() {
  try {
    const ev = (date, title, type, body) => ({ id: 'd_' + date + type, date, title, type, parties: '', body, attachments: [] });
    await importData({ app: 'caseboard', case: {
      schema: 2, title: 'Demo: Eksempelsag (fiktiv)', meta: {},
      events: [
        ev('2025-01-10', 'Første henvendelse fra klient', 'mail', 'Klienten beder om bistand i en eksempel-tvist.'),
        ev('2025-02-03', 'Modtaget kontraktudkast fra modpart', 'dokument', 'Udkast gennemgås.'),
        ev('2025-03-15', 'Forligsmøde afholdt', 'handling', 'Drøftet vilkår; ingen enighed endnu.'),
        ev('2025-04-01', 'Frist for accept', 'note', 'Husk fristen.'),
      ],
      summaries: [
        { id: 'ds1', title: 'Min strategi', body: 'Skriv dine egne argumenter her — og træk begivenheder fra tidslinjen ind.', links: [] },
        { id: 'ds2', title: 'Åbne punkter', body: '• Punkt 1\n• Punkt 2', links: [] },
      ] }, files: {} });
  } catch (e) { fail(e); }
}

// ---------- gen-brugte DOM-stykker ----------
function editable(tag, value, onsave, cls = '') {
  const n = el(tag, { class: 'edit ' + cls, contenteditable: 'true' }, value || '');
  n.addEventListener('blur', () => onsave(n.textContent.trim()));
  return n;
}
const fileInput = (label) => el('label', { class: 'btn ghost file' }, label,
  el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => e.target.files[0] && importCase(e.target.files[0]) }));

// ---------- HJEM (Mine sager) ----------
function caseCard(c) {
  return el('div', { class: 'casecard', onclick: () => openCaseById(c.id) },
    el('div', { class: 'cc-title' }, c.title || '(uden titel)'),
    el('div', { class: 'cc-meta' }, `${(c.events || []).length} begivenheder · ${(c.summaries || []).length} opsummeringer`),
    c.updated ? el('div', { class: 'cc-meta sub' }, 'Senest ændret ' + new Date(c.updated).toLocaleDateString('da-DK')) : null,
    el('div', { class: 'cc-actions' },
      el('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); openCaseById(c.id); } }, 'Åbn'),
      el('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); exportCaseById(c.id); } }, '⤓'),
      el('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); deleteCase(c.id); } }, '🗑')));
}

function renderHome() {
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand', onclick: navHome, title: 'Hjem' }, '⚖️ CaseBoard'),
    el('div', { class: 'casetitle' }, 'Mine sager'),
    el('div', { class: 'tools' },
      el('button', { class: 'btn primary', onclick: createCase }, '➕ Ny sag'),
      fileInput('⤒ Importér sag')));

  const body = el('div', { class: 'home' });
  if (!state.cases.length) {
    body.append(el('div', { class: 'empty' },
      el('h2', {}, 'Velkommen til CaseBoard'),
      el('p', {}, 'Et privat værktøj til at føre dine sager. Alt gemmes lokalt på din maskine.'),
      el('div', { class: 'tools center' },
        el('button', { class: 'btn primary', onclick: createCase }, 'Start ny sag'),
        el('button', { class: 'btn', onclick: loadDemo }, 'Indlæs demo (fiktiv)'),
        fileInput('Importér sag (.json)'))));
  } else {
    const grid = el('div', { class: 'casegrid' },
      ...state.cases.sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(caseCard),
      el('div', { class: 'casecard add', onclick: createCase }, el('div', { class: 'plus' }, '＋'), el('div', {}, 'Ny sag')));
    body.append(grid);
  }
  root().replaceChildren(header, body);
}

// ---------- SAGS-DETALJE ----------
function eventCard(ev) {
  const card = el('div', { class: 'card ev type-' + ev.type, draggable: 'true', dataset: { id: ev.id } },
    el('div', { class: 'ev-head' },
      el('span', { class: 'date' }, daDate(ev.date)),
      el('span', { class: 'type' }, ev.type),
      editable('span', ev.title, (v) => patch(ev, 'title', v), 'title')),
    ev.parties ? el('div', { class: 'parties' }, ev.parties) : null,
    editable('div', ev.body, (v) => patch(ev, 'body', v), 'body'),
    el('div', { class: 'chips' },
      ...ev.attachments.map((a) => el('span', { class: 'chip doc', onclick: () => openFile(a.fileId) }, '📎 ' + a.name)),
      el('span', { class: 'chip del', title: 'Slet', onclick: () => { state.case.events = state.case.events.filter((x) => x.id !== ev.id); save(); renderCase(); } }, '✕')));
  card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ refId: ev.id, label: daDate(ev.date) + ' — ' + ev.title })));
  return card;
}

function summaryCard(su) {
  const drop = el('div', { class: 'links' }, ...su.links.map((l) =>
    el('span', { class: 'chip link' }, l.label,
      el('b', { class: 'x', onclick: () => { su.links = su.links.filter((y) => y.refId !== l.refId); save(); renderCase(); } }, ' ✕'))));
  const card = el('div', { class: 'card summary' },
    el('div', { class: 'su-head' },
      editable('span', su.title, (v) => patch(su, 'title', v), 'title'),
      el('span', { class: 'x del', title: 'Slet', onclick: () => { state.case.summaries = state.case.summaries.filter((x) => x.id !== su.id); save(); renderCase(); } }, '🗑')),
    editable('div', su.body, (v) => patch(su, 'body', v), 'body'),
    el('div', { class: 'drophint' }, 'Træk en begivenhed herind →'),
    drop);
  card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('over'); });
  card.addEventListener('dragleave', () => card.classList.remove('over'));
  card.addEventListener('drop', (e) => {
    e.preventDefault(); card.classList.remove('over');
    try { linkToSummary(su.id, JSON.parse(e.dataTransfer.getData('text/plain'))); } catch (err) { fail(err); }
  });
  return card;
}

function renderCase() {
  const c = state.case;
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'nav' },
      el('button', { class: 'btn nav-btn', onclick: back, title: 'Tilbage' }, '←'),
      el('button', { class: 'btn nav-btn', onclick: navHome, title: 'Hjem' }, '🏠'),
      el('button', { class: 'btn nav-btn', onclick: navHome, title: 'Mine sager' }, '🗂 Mine sager')),
    editable('div', c.title, (v) => patch(c, 'title', v), 'casetitle'),
    el('div', { class: 'tools' },
      el('button', { class: 'btn primary', onclick: addEventFromModal }, '➕ Indsæt'),
      el('button', { class: 'btn', onclick: addSummary }, '＋ Opsummering'),
      el('button', { class: 'btn ghost', onclick: () => exportCaseObj(c) }, '⤓ Eksportér')));

  const timeline = el('main', { class: 'timeline' },
    el('h2', {}, 'Tidslinje'),
    ...(c.events.length ? sortEvents(c.events).map(eventCard) : [el('p', { class: 'muted' }, 'Ingen begivenheder endnu. Tryk “➕ Indsæt”.')]));
  const side = el('aside', { class: 'summaries' },
    el('h2', {}, 'Mine opsummeringer'),
    el('p', { class: 'muted' }, 'Træk begivenheder fra tidslinjen ind i et kort.'),
    ...(c.summaries.length ? c.summaries.map(summaryCard) : [el('p', { class: 'muted' }, 'Ingen endnu — tryk “＋ Opsummering”.')]));
  root().replaceChildren(header, el('div', { class: 'layout' }, timeline, side));
}

// ---------- migration (v1 enkelt-sag -> 'cases') + boot ----------
async function migrateLegacy() {
  const cases = await db.listCases();
  if (cases.length) return;
  const legacy = await db.getLegacyCase();
  if (legacy) {
    legacy.id = legacy.id || uid('case');
    legacy.updated = legacy.updated || Date.now();
    await db.saveCaseRec(legacy); await db.clearLegacy();
    log.ok('app', 'migrerede gammel enkelt-sag til Mine sager');
  }
}
(async function boot() {
  try {
    await db.openDB();
    await migrateLegacy();
    await navHome();
    log.info('app', 'boot', state.cases.length + ' sager');
  } catch (e) { fail(e); }
})();
