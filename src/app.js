// app.js — controller: multi-sag + navigation + dokument-baseret tidslinje (v2).
import { log } from './log.js';
import { Err, AppError } from './errors.js';
import * as db from './db.js';
import { newCase, newEvent, newSummary, sortEvents, daDate, TYPES, today, uid, fileKind, kindIcon, ROLES, newPerson, newDeadline, deadlineStatus } from './model.js';
import { el, toast, insertModal } from './ui.js';
import { caseToDocs, buildIndex, runSearch, snippet, highlight, KINDS } from './search.js';
import { buildShareZip, overviewHtml } from './export.js';
import { drawConnectors, clearConnectors } from './connectors.js';

const root = () => document.getElementById('app');
const state = {
  view: 'home', case: null, cases: [], history: [],
  openCaseObjs: {}, openOrder: [], activeCaseId: null, tab: 'overblik',  // faner: åbne sager + sektion
  expanded: new Set(), selEvent: null, selSummary: null,
  tlFilter: { types: new Set(), tags: new Set() },   // filtre på tidslinjen
};
const resetView = () => { state.expanded = new Set(); state.selEvent = state.selSummary = null; state.tlFilter = { types: new Set(), tags: new Set() }; };
const SECTIONS = [
  { id: 'overblik', label: 'Overblik', icon: '📋' },
  { id: 'tidslinje', label: 'Tidslinje', icon: '📅' },
  { id: 'dokumenter', label: 'Dokumenter', icon: '📎' },
  { id: 'personer', label: 'Personer', icon: '👤' },
  { id: 'frister', label: 'Frister', icon: '⏰' },
  { id: 'soeg', label: 'Søg', icon: '🔎' },
];
let _urls = [];                              // aktive blob-URL'er (ryddes ved hver re-render)
const blobUrl = (blob) => { const u = URL.createObjectURL(blob); _urls.push(u); return u; };
function revokeUrls() { _urls.forEach((u) => URL.revokeObjectURL(u)); _urls = []; }

// ---------- fil-hjælpere ----------
const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });
const b64ToBlob = (b64, mime) => { const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime || 'application/octet-stream' }); };
const caseFileIds = (c) => { const s = new Set(); for (const ev of c.events || []) for (const a of ev.attachments || []) if (a.fileId) s.add(a.fileId); return [...s]; };
function fail(e) { const a = e instanceof AppError ? `${e.code}: ${e.message}` : (e?.message || e); log.err('app', a, e); toast('Fejl — ' + a, 'err'); }
const save = () => { if (!state.case) return Promise.resolve(); state.case.updated = Date.now(); return db.saveCaseRec(state.case).catch(fail); };

// ---------- navigation ----------
function renderRoute() { state.view === 'case' ? renderCase() : renderHome(); }
async function refreshCases() { state.cases = await db.listCases(); }
async function navHome() { state.history = []; state.view = 'home'; state.case = null; state.selEvent = state.selSummary = null; await refreshCases(); renderHome(); }
async function openCaseById(id) {
  if (state.openCaseObjs[id]) return switchCase(id);                  // allerede åben → bare skift
  const c = await db.getCase(id); if (!c) return toast('Sagen blev ikke fundet', 'warn'); openCaseObj(c);
}
function openCaseObj(c) {
  if (!state.openOrder.includes(c.id)) state.openOrder.push(c.id);
  state.openCaseObjs[c.id] = c;
  state.activeCaseId = c.id; state.case = c; state.view = 'case'; state.tab = 'overblik';
  resetView();
  renderCase();
}
function switchCase(id) {
  if (!state.openCaseObjs[id]) return;
  state.activeCaseId = id; state.case = state.openCaseObjs[id]; state.view = 'case';
  resetView();
  renderCase();
}
function closeCase(id) {
  delete state.openCaseObjs[id]; state.openOrder = state.openOrder.filter((x) => x !== id);
  if (state.activeCaseId === id) {
    const next = state.openOrder[state.openOrder.length - 1];
    if (next) switchCase(next); else navHome();
  } else renderCase();
}
function setTab(t) { state.tab = t; state.selEvent = state.selSummary = null; renderCase(); }
function back() { state.history.pop(); navHome(); }

// ---------- sags-handlinger ----------
async function createCase() { const c = newCase('Ny sag'); await db.saveCaseRec(c); await refreshCases(); openCaseObj(c); toast('Ny sag oprettet', 'ok'); }
async function deleteCase(id) {
  const c = await db.getCase(id); if (!c) return;
  if (!confirm(`Slet sagen “${c.title}” permanent? (Eksportér først hvis du vil beholde en kopi.)`)) return;
  for (const fid of caseFileIds(c)) await db.delFile(fid);
  await db.delCaseRec(id); await refreshCases(); renderHome(); toast('Sag slettet', 'ok');
}

async function addEventFromModal() {
  const data = await insertModal({ TYPES, today });
  if (!data) return;
  const attachments = [];
  if (data.file) {
    const id = uid('file');
    await db.putFile(id, { name: data.file.name, mime: data.file.type, blob: data.file });
    attachments.push({ fileId: id, name: data.file.name, mime: data.file.type });
    if (!data.title) data.title = data.file.name.replace(/\.[^.]+$/, '');   // auto-titel fra filnavn
    if (data.type === 'handling') data.type = 'dokument';
  }
  const ev = newEvent({ ...data, attachments });
  state.case.events.push(ev);
  state.expanded.add(ev.id);
  await save(); renderCase();
  toast('Indsat på ' + daDate(ev.date), 'ok');
}

function openOriginal(att) { db.getFile(att.fileId).then((rec) => { if (!rec) return toast('Filen mangler', 'warn'); window.open(blobUrl(rec.blob), '_blank'); }).catch(fail); }
function exportOriginal(att) { db.getFile(att.fileId).then((rec) => { if (!rec) return; const a = el('a', { href: blobUrl(rec.blob), download: att.name || 'bilag' }); a.click(); }).catch(fail); }

function patch(obj, key, val) { obj[key] = val; save(); }
function addSummary() { const s = newSummary(); state.case.summaries.unshift(s); save(); renderCase(); return s; }
function linkEventToSummary(summaryId, ev) {
  const s = state.case.summaries.find((x) => x.id === summaryId); if (!s) return;
  if (s.links.some((l) => l.refId === ev.id)) { s.links = s.links.filter((l) => l.refId !== ev.id); }  // toggle
  else { s.links.push({ refId: ev.id, label: daDate(ev.date) + ' — ' + ev.title }); }
  save(); renderCase();
}

// ---------- markering (klik på begivenhed / opsummering) ----------
function selectEvent(id) { state.selEvent = state.selEvent === id ? null : id; state.selSummary = null; renderCase(); }
function selectSummary(id) { state.selSummary = state.selSummary === id ? null : id; state.selEvent = null; renderCase(); }
const summariesForEvent = (evId) => state.case.summaries.filter((s) => s.links.some((l) => l.refId === evId));

// ---------- eksport / import ----------
async function exportCaseObj(c) {
  try {
    const out = { app: 'caseboard', exported: new Date().toISOString(), case: c, files: {} };
    for (const fid of caseFileIds(c)) { const rec = await db.getFile(fid); if (rec) out.files[fid] = { name: rec.name, mime: rec.mime, b64: await blobToB64(rec.blob) }; }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    el('a', { href: blobUrl(blob), download: (c.title || 'sag').replace(/\s+/g, '-') + '.caseboard.json' }).click();
    toast('Sag eksporteret', 'ok');
  } catch (e) { fail(Err.export('eksport fejlede', e)); }
}
async function exportCaseById(id) { const c = await db.getCase(id); if (c) exportCaseObj(c); }
// Eksportér som DELBAR PAKKE (zip: mappe m. Bilag/ + læsbar oversigt + gen-import-fil)
async function exportShare(c) {
  try {
    toast('Pakker sagen til deling …');
    const fileRecs = {}, filesJson = {};
    for (const fid of caseFileIds(c)) {
      const rec = await db.getFile(fid); if (!rec) continue;
      fileRecs[fid] = { name: rec.name, mime: rec.mime, bytes: new Uint8Array(await rec.blob.arrayBuffer()) };
      filesJson[fid] = { name: rec.name, mime: rec.mime, b64: await blobToB64(rec.blob) };
    }
    const jsonString = JSON.stringify({ app: 'caseboard', exported: new Date().toISOString(), case: c, files: filesJson });
    const { folder, bytes } = buildShareZip(c, fileRecs, jsonString);
    el('a', { href: blobUrl(new Blob([bytes], { type: 'application/zip' })), download: folder + '.zip' }).click();
    toast('Pakke klar: ' + folder + '.zip — udpak og del mappen', 'ok');
  } catch (e) { fail(Err.export('pakke-eksport fejlede', e)); }
}
async function importData(data) {
  if (!data || !data.case) throw Err.import('ikke en gyldig CaseBoard-fil');
  const c = data.case; c.id = uid('case'); c.updated = Date.now();
  const remap = {};
  for (const [oldId, f] of Object.entries(data.files || {})) { const nid = uid('file'); remap[oldId] = nid; await db.putFile(nid, { name: f.name, mime: f.mime, blob: b64ToBlob(f.b64, f.mime) }); }
  for (const ev of c.events || []) ev.attachments = (ev.attachments || []).map((a) => ({ ...a, fileId: remap[a.fileId] || a.fileId }));
  await db.saveCaseRec(c); await refreshCases(); openCaseObj(c); toast('Sag importeret: ' + (c.title || ''), 'ok');
}
async function importCase(file) { try { await importData(JSON.parse(await file.text())); } catch (e) { fail(e instanceof AppError ? e : Err.import('import fejlede', e)); } }
async function loadDemo() {
  try {
    const ev = (date, title, type, body) => ({ id: 'd_' + date + type, date, title, type, parties: '', body, attachments: [] });
    await importData({ app: 'caseboard', case: { schema: 2, title: 'Demo: Eksempelsag (fiktiv)', meta: {}, events: [
      ev('2025-01-10', 'Første henvendelse fra klient', 'mail', 'Klienten beder om bistand i en eksempel-tvist.'),
      ev('2025-02-03', 'Kontraktudkast fra modpart', 'dokument', 'Udkast gennemgås.'),
      ev('2025-03-15', 'Forligsmøde afholdt', 'handling', 'Drøftet vilkår; ingen enighed.'),
    ], summaries: [
      { id: 'ds1', title: 'Min strategi', body: 'Træk begivenheder ind via “+”.', links: [], anchorDate: null },
    ] }, files: {} });
  } catch (e) { fail(e); }
}

// ---------- gen-brugte DOM-stykker ----------
function editable(tag, value, onsave, cls = '') {
  const n = el(tag, { class: 'edit ' + cls, contenteditable: 'true' }, value || '');
  n.addEventListener('blur', () => onsave(n.textContent.trim()));
  n.addEventListener('click', (e) => e.stopPropagation());        // redigér uden at toggle/markere
  return n;
}
// "Åbn sag" — vælg en sagsfil (ordet JSON nævnes ikke for brugeren).
const openSagBtn = (label) => el('label', { class: 'btn ghost file' }, label,
  el('input', { type: 'file', accept: '.json,.caseboard,application/json', style: 'display:none', onchange: (e) => e.target.files[0] && importCase(e.target.files[0]) }));

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
  revokeUrls();
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand', onclick: navHome, title: 'Hjem' }, '⚖️ CaseBoard'),
    el('div', { class: 'casetitle' }, 'Mine sager'),
    el('div', { class: 'tools' }, el('button', { class: 'btn primary', onclick: createCase }, '➕ Ny sag'), openSagBtn('📂 Åbn sag')));
  const body = el('div', { class: 'home' });
  if (!state.cases.length) {
    body.append(el('div', { class: 'empty' },
      el('h2', {}, 'Mine sager'),
      el('p', { class: 'big' }, 'Du har ingen sager endnu.'),
      el('p', {}, 'En sag samler hele forløbet ét sted: tidslinje, bilag og dine opsummeringer. Alt gemmes lokalt på din computer — intet sendes nogen steder.'),
      el('div', { class: 'tools center' },
        el('button', { class: 'btn primary', onclick: createCase }, '➕ Opret ny sag'),
        openSagBtn('📂 Åbn en sag'),
        el('button', { class: 'btn', onclick: loadDemo }, '✨ Se et eksempel')),
      el('div', { class: 'dropnote' }, '⤓ … eller træk en sagsfil ind her'),
      el('p', { class: 'hint muted' }, '“Åbn en sag” henter en sagsfil du har gemt eller fået tilsendt.')));
  } else {
    body.append(globalSearchBar(), el('div', { class: 'casegrid' }, ...state.cases.sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(caseCard),
      el('div', { class: 'casecard add', onclick: createCase }, el('div', { class: 'plus' }, '＋'), el('div', {}, 'Ny sag'))));
  }
  // træk-en-sagsfil-ind (forstås nemmere end en fil-dialog)
  body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drop-active'); });
  body.addEventListener('dragleave', (e) => { if (e.target === body) body.classList.remove('drop-active'); });
  body.addEventListener('drop', (e) => { e.preventDefault(); body.classList.remove('drop-active'); const f = e.dataTransfer.files[0]; if (f) importCase(f); });
  root().replaceChildren(header, body);
}

// ---------- "+ Tilføj til opsummering"-popover ----------
function summaryPopover(anchorEl, ev) {
  document.querySelector('.popover')?.remove();
  const r = anchorEl.getBoundingClientRect();
  const inSet = new Set(summariesForEvent(ev.id).map((s) => s.id));
  const pop = el('div', { class: 'popover', style: `top:${Math.round(r.bottom + 4)}px; left:${Math.round(Math.min(r.left, innerWidth - 250))}px` },
    el('div', { class: 'po-head' }, 'Føj til opsummering'),
    ...(state.case.summaries.length ? state.case.summaries.map((s) =>
      el('div', { class: 'po-item' + (inSet.has(s.id) ? ' on' : ''), onclick: () => { linkEventToSummary(s.id, ev); pop.remove(); } },
        (inSet.has(s.id) ? '✓ ' : '＋ ') + (s.title || '(uden titel)'))) : [el('div', { class: 'po-empty' }, 'Ingen endnu')]),
    el('div', { class: 'po-item new', onclick: () => { const s = addSummary(); linkEventToSummary(s.id, ev); } }, '✚ Ny opsummering'));
  const close = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) { pop.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
  document.body.append(pop);
}

// ---------- SAGS-DETALJE: tidslinje-fane (sammenklappelig, dokument-baseret) ----------
function previewInto(box, att) {
  const kind = fileKind(att.mime, att.name);
  db.getFile(att.fileId).then((rec) => {
    if (!rec) { box.append(el('div', { class: 'pv-missing' }, 'Filen mangler')); return; }
    const url = blobUrl(rec.blob);
    if (kind === 'image') box.append(el('img', { class: 'pv-img', src: url }));
    else if (kind === 'pdf') box.append(el('iframe', { class: 'pv-pdf', src: url + '#toolbar=0&view=FitH' }));
    else box.append(el('div', { class: 'pv-doc' }, el('div', { class: 'pv-ico' }, kindIcon(kind)), el('div', {}, att.name), el('div', { class: 'muted' }, 'Forhåndsvisning ikke muligt for denne type — åbn originalen')));
  }).catch(fail);
}

function eventCard(ev) {
  const att = (ev.attachments || [])[0];
  const kind = att ? fileKind(att.mime, att.name) : 'other';
  const open = state.expanded.has(ev.id);
  const selected = state.selEvent === ev.id;
  const hot = (state.selSummary && state.case.summaries.find((s) => s.id === state.selSummary)?.links.some((l) => l.refId === ev.id));
  const cls = `card ev fane type-${ev.type}${open ? ' open' : ''}${selected ? ' selected' : ''}${hot ? ' hot' : ''}`;

  const head = el('div', { class: 'fane-head', onclick: () => selectEvent(ev.id) },
    el('span', { class: 'caret', onclick: (e) => { e.stopPropagation(); open ? state.expanded.delete(ev.id) : state.expanded.add(ev.id); renderCase(); } }, open ? '▾' : '▸'),
    el('span', { class: 'date' }, daDate(ev.date)),
    el('span', { class: 'ficon' }, att ? kindIcon(kind) : '•'),
    editable('span', ev.title, (v) => patch(ev, 'title', v), 'title'),
    el('button', { class: 'plus-btn', title: 'Føj til opsummering', onclick: (e) => { e.stopPropagation(); summaryPopover(e.currentTarget, ev); } }, '＋'),
    el('button', { class: 'mini del', title: 'Slet', onclick: (e) => { e.stopPropagation(); state.case.events = state.case.events.filter((x) => x.id !== ev.id); save(); renderCase(); } }, '✕'));

  const card = el('div', { class: cls, dataset: { id: ev.id } }, head);
  // tags: hvilke opsummeringer er begivenheden i
  const inSums = summariesForEvent(ev.id);
  if (inSums.length) card.append(el('div', { class: 'fane-tags' }, ...inSums.map((s) => el('span', { class: 'tag', onclick: () => selectSummary(s.id) }, '🏷 ' + (s.title || '…')))));

  if (open) {
    const body = el('div', { class: 'fane-body' });
    if (att) {
      const pv = el('div', { class: 'preview' }); previewInto(pv, att); body.append(pv);
      body.append(el('div', { class: 'doc-actions' },
        el('button', { class: 'btn sm', onclick: () => openOriginal(att) }, '🔍 Åbn original'),
        el('button', { class: 'btn ghost sm', onclick: () => exportOriginal(att) }, '⤓ Eksportér bilag'),
        el('span', { class: 'doc-name muted' }, att.name)));
    }
    if (ev.parties) body.append(el('div', { class: 'parties' }, ev.parties));
    body.append(el('div', { class: 'note-label muted' }, 'Note (din — dokumentet kan ikke ændres):'),
      editable('div', ev.body, (v) => patch(ev, 'body', v), 'body'));
    // etiketter
    ev.tags = ev.tags || [];
    body.append(el('div', { class: 'tagsrow' }, el('span', { class: 'muted sm' }, '🏷'),
      ...ev.tags.map((t) => el('span', { class: 'etag' }, t, el('b', { class: 'x', onclick: () => { ev.tags = ev.tags.filter((x) => x !== t); save(); renderCase(); } }, ' ✕'))),
      el('input', { class: 'taginput', placeholder: '+ etiket', onkeydown: (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v && !ev.tags.includes(v)) { ev.tags.push(v); save(); renderCase(); } } } })));
    // personer (kun hvis sagen har nogen)
    const ppl = state.case.people || [];
    if (ppl.length) {
      ev.people = ev.people || [];
      body.append(el('div', { class: 'tagsrow' }, el('span', { class: 'muted sm' }, '👤'),
        ...ppl.map((p) => el('span', { class: 'ptag' + (ev.people.includes(p.id) ? ' on' : ''),
          onclick: () => { ev.people = ev.people.includes(p.id) ? ev.people.filter((x) => x !== p.id) : [...ev.people, p.id]; save(); renderCase(); } }, p.name))));
    }
    card.append(body);
  }
  return card;
}

function summaryCard(su) {
  const selected = state.selSummary === su.id;
  const hot = state.selEvent && su.links.some((l) => l.refId === state.selEvent);
  const card = el('div', { class: `card summary${selected ? ' selected' : ''}${hot ? ' hot' : ''}`, draggable: 'true', dataset: { sid: su.id } },
    el('div', { class: 'su-head', onclick: () => selectSummary(su.id) },
      el('span', { class: 'grip', title: 'Træk for at flytte' }, '⠿'),
      editable('span', su.title, (v) => patch(su, 'title', v), 'title'),
      el('span', { class: 'x del', title: 'Slet', onclick: (e) => { e.stopPropagation(); state.case.summaries = state.case.summaries.filter((x) => x.id !== su.id); save(); renderCase(); } }, '🗑')),
    editable('div', su.body, (v) => patch(su, 'body', v), 'body'));
  // anker til markeret begivenheds dato
  const anchorRow = el('div', { class: 'anchor-row' });
  if (su.anchorDate) anchorRow.append(el('span', { class: 'anchor' }, '📌 ' + daDate(su.anchorDate), el('b', { class: 'x', onclick: () => { su.anchorDate = null; save(); renderCase(); } }, ' ✕')));
  else if (state.selEvent) { const e = state.case.events.find((x) => x.id === state.selEvent); if (e) anchorRow.append(el('button', { class: 'btn ghost sm', onclick: () => { su.anchorDate = e.date; save(); renderCase(); } }, '📌 Anker til ' + daDate(e.date))); }
  card.append(anchorRow);
  // linkede begivenheder
  card.append(el('div', { class: 'links' }, ...su.links.map((l) =>
    el('span', { class: 'chip link', onclick: () => selectEvent(l.refId) }, l.label,
      el('b', { class: 'x', onclick: (e) => { e.stopPropagation(); su.links = su.links.filter((y) => y.refId !== l.refId); save(); renderCase(); } }, ' ✕')))));
  // drag-reorder (træk opsummeringer rundt)
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('sid', su.id); card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', (e) => {
    e.preventDefault(); const sid = e.dataTransfer.getData('sid'); if (!sid || sid === su.id) return;
    const arr = state.case.summaries; const from = arr.findIndex((x) => x.id === sid); const to = arr.findIndex((x) => x.id === su.id);
    if (from < 0 || to < 0) return; arr.splice(to, 0, arr.splice(from, 1)[0]); save(); renderCase();
  });
  return card;
}

function casetabsStrip() {
  return el('div', { class: 'casetabs' },
    el('div', { class: 'casetab homebtn', title: 'Mine sager', onclick: navHome }, '🏠'),
    ...state.openOrder.map((id) => {
      const co = state.openCaseObjs[id]; const active = id === state.activeCaseId;
      return el('div', { class: 'casetab' + (active ? ' active' : ''), onclick: () => switchCase(id) },
        el('span', { class: 't' }, co?.title || 'Sag'),
        el('span', { class: 'close', title: 'Luk fane', onclick: (e) => { e.stopPropagation(); closeCase(id); } }, '✕'));
    }));
}

function renderCase() {
  revokeUrls();
  const c = state.case;
  const topbar = el('header', { class: 'topbar' },
    el('div', { class: 'brand', onclick: navHome, title: 'Hjem' }, '⚖️ CaseBoard'),
    el('div', { class: 'tools' }, el('button', { class: 'btn primary', onclick: createCase }, '➕ Ny sag'), openSagBtn('📂 Åbn sag')));

  const casehead = el('div', { class: 'casehead' },
    editable('div', c.title, (v) => patch(c, 'title', v), 'headtitle'),
    el('div', { class: 'tools' },
      el('button', { class: 'btn primary', onclick: addEventFromModal }, '➕ Indsæt bilag'),
      el('button', { class: 'btn', onclick: () => { state.tab = 'tidslinje'; addSummary(); } }, '＋ Opsummering'),
      el('button', { class: 'btn ghost', onclick: () => exportCaseObj(c), title: 'Gem hele sagen som én fil (til backup / gen-import)' }, '💾 Gem sag'),
      el('button', { class: 'btn ghost', onclick: () => exportShare(c), title: 'Pak sagen som en mappe (Bilag + læsbar oversigt) — nem at dele med en kollega' }, '📦 Del'),
      el('button', { class: 'btn ghost', onclick: () => printChronology(c), title: 'Print en ren kronologi (til retten/møder) — vælg "Gem som PDF"' }, '🖨 Print')));

  const counts = { tidslinje: c.events.length, dokumenter: caseFileIds(c).length, personer: (c.people || []).length, frister: (c.deadlines || []).length };
  const sectiontabs = el('div', { class: 'sectiontabs' }, ...SECTIONS.map((s) =>
    el('div', { class: 'sectiontab' + (state.tab === s.id ? ' active' : ''), onclick: () => setTab(s.id) },
      s.icon + ' ' + s.label, counts[s.id] ? el('span', { class: 'badge' }, String(counts[s.id])) : null)));

  const view = state.tab === 'tidslinje' ? renderTidslinje(c)
    : state.tab === 'dokumenter' ? renderDokumenter(c)
    : state.tab === 'personer' ? renderPersoner(c)
    : state.tab === 'frister' ? renderFrister(c)
    : state.tab === 'soeg' ? renderSoeg(c) : renderOverblik(c);
  root().replaceChildren(topbar, casetabsStrip(), casehead, sectiontabs, el('div', { class: 'sectionbody' }, view));
  // forbindelses-streger: valgt opsummering → dens begivenheder (kun på tidslinjen)
  if (state.tab === 'tidslinje' && state.selSummary) {
    const s = (c.summaries || []).find((x) => x.id === state.selSummary);
    requestAnimationFrame(() => { const layout = root().querySelector('.layout'); if (layout && s) drawConnectors(layout, s); });
  } else clearConnectors();
}
let _redrawTimer;
window.addEventListener('resize', () => {
  clearTimeout(_redrawTimer);
  _redrawTimer = setTimeout(() => {
    if (state.view === 'case' && state.tab === 'tidslinje' && state.selSummary && state.case) {
      const layout = root().querySelector('.layout');
      const s = state.case.summaries.find((x) => x.id === state.selSummary);
      if (layout && s) drawConnectors(layout, s);
    }
  }, 120);
});

// ---- Sektion: Tidslinje (begivenheder + opsummeringer) ----
function renderTidslinje(c) {
  const all = sortEvents(c.events);
  const allTags = [...new Set(all.flatMap((e) => e.tags || []))].sort();
  const f = state.tlFilter;
  const evs = all.filter((e) => (!f.types.size || f.types.has(e.type)) && (!f.tags.size || (e.tags || []).some((t) => f.tags.has(t))));
  const fchip = (set, val, label) => el('span', { class: 'fchip' + (set.has(val) ? ' on' : ''), onclick: () => { set.has(val) ? set.delete(val) : set.add(val); renderCase(); } }, label);
  const filterbar = all.length ? el('div', { class: 'filterbar' },
    el('span', { class: 'muted sm' }, 'Filtrér:'),
    ...TYPES.map((t) => fchip(f.types, t, t)),
    allTags.length ? el('span', { class: 'fsep' }, '|') : null,
    ...allTags.map((t) => fchip(f.tags, t, '🏷 ' + t)),
    (f.types.size || f.tags.size) ? el('span', { class: 'fclear', onclick: () => { f.types.clear(); f.tags.clear(); renderCase(); } }, '✕ Ryd') : null) : null;
  const timeline = el('main', { class: 'timeline' },
    el('div', { class: 'tl-head' }, el('h2', {}, 'Tidslinje' + (evs.length !== all.length ? ` (${evs.length}/${all.length})` : '')),
      all.length ? el('div', { class: 'tl-tools' },
        el('button', { class: 'mini-btn', onclick: () => { evs.forEach((e) => state.expanded.add(e.id)); renderCase(); } }, 'Udvid alle'),
        el('button', { class: 'mini-btn', onclick: () => { state.expanded.clear(); renderCase(); } }, 'Fold alle')) : null),
    filterbar,
    ...(evs.length ? evs.map(eventCard) : [el('p', { class: 'muted' }, all.length ? 'Ingen begivenheder matcher filteret.' : 'Ingen bilag endnu. Tryk “➕ Indsæt bilag” og upload et dokument, en PDF eller et billede.')]));
  const anchored = c.summaries.filter((s) => s.anchorDate).sort((a, b) => a.anchorDate < b.anchorDate ? -1 : 1);
  const rest = c.summaries.filter((s) => !s.anchorDate);
  const side = el('aside', { class: 'summaries' },
    el('h2', {}, 'Mine opsummeringer'),
    el('p', { class: 'muted' }, 'Markér en begivenhed → “+” for at føje den til en opsummering. Træk kort for at flytte; ankr til en dato.'),
    ...[...anchored, ...rest].map(summaryCard),
    c.summaries.length ? null : el('p', { class: 'muted' }, 'Ingen endnu — tryk “＋ Opsummering”.'));
  return el('div', { class: 'layout' }, timeline, side);
}

// ---- Sektion: Overblik ----
function renderOverblik(c) {
  const evs = sortEvents(c.events);
  const recent = [...evs].reverse().slice(0, 6);
  const jump = (tab, fn) => { state.tab = tab; fn && fn(); renderCase(); };
  return el('div', { class: 'ovgrid' },
    el('div', { class: 'ovcard' }, el('h3', {}, 'Nøgletal'),
      el('div', { class: 'ovstat' }, String(c.events.length)), el('div', { class: 'muted' }, 'begivenheder i sagen'),
      el('div', { class: 'ovrow' }, el('span', {}, 'Dokumenter/bilag'), el('span', { class: 'd' }, String(caseFileIds(c).length))),
      el('div', { class: 'ovrow' }, el('span', {}, 'Opsummeringer'), el('span', { class: 'd' }, String(c.summaries.length)))),
    el('div', { class: 'ovcard' }, el('h3', {}, 'Sagsdata'),
      ...Object.entries(c.meta || {}).map(([k, v]) => el('div', { class: 'ovrow' }, el('span', {}, k), el('span', { class: 'd' }, String(v)))),
      Object.keys(c.meta || {}).length ? null : el('div', { class: 'muted' }, 'Ingen sagsdata endnu')),
    el('div', { class: 'ovcard' }, el('h3', {}, 'Kommende frister'),
      ...(() => {
        const dls = (c.deadlines || []).filter((d) => !d.done).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 4);
        if (!dls.length) return [el('div', { class: 'muted' }, 'Ingen åbne frister'), el('div', { class: 'ovlink', onclick: () => jump('frister') }, '+ Tilføj en frist')];
        return [...dls.map((d) => el('div', { class: 'ovrow' }, el('span', { class: 'd dl-' + deadlineStatus(d.date) }, daDate(d.date)), el('span', { class: 'ovlink', onclick: () => jump('frister') }, d.title)))];
      })()),
    el('div', { class: 'ovcard' }, el('h3', {}, 'Emner / opsummeringer'),
      ...(c.summaries.length ? c.summaries.map((s) => el('div', { class: 'ovrow' },
        el('span', { class: 'ovlink', onclick: () => jump('tidslinje', () => { state.selSummary = s.id; state.selEvent = null; }) }, s.title || '(uden titel)'),
        el('span', { class: 'd' }, String(s.links.length)))) : [el('div', { class: 'muted' }, 'Ingen endnu')])),
    el('div', { class: 'ovcard' }, el('h3', {}, 'Seneste'),
      ...(recent.length ? recent.map((e) => el('div', { class: 'ovrow' },
        el('span', { class: 'd' }, daDate(e.date)),
        el('span', { class: 'ovlink', onclick: () => jump('tidslinje', () => { state.expanded.add(e.id); state.selEvent = e.id; state.selSummary = null; }) }, e.title))) : [el('div', { class: 'muted' }, 'Ingen endnu')])));
}

// ---- Sektion: Dokumenter ----
function renderDokumenter(c) {
  const rows = [];
  for (const ev of sortEvents(c.events)) for (const a of ev.attachments || []) rows.push({ a, ev });
  if (!rows.length) return el('div', { class: 'muted' }, 'Ingen dokumenter endnu. Upload via “➕ Indsæt bilag”.');
  return el('div', { class: 'doclist' }, ...rows.map(({ a, ev }) =>
    el('div', { class: 'docrow' },
      el('span', { class: 'ficon' }, kindIcon(fileKind(a.mime, a.name))),
      el('span', { class: 'docrow-name' }, a.name),
      el('span', { class: 'docrow-date muted' }, daDate(ev.date)),
      el('button', { class: 'btn sm', onclick: () => openOriginal(a) }, '🔍 Åbn'),
      el('button', { class: 'btn ghost sm', onclick: () => exportOriginal(a) }, '⤓ Eksportér'))));
}

// ---- Print: ren kronologi (genbruger den læsbare oversigt) → native PDF ----
function printChronology(c) {
  const html = overviewHtml(c, sortEvents(c.events), {});
  const w = window.open('', '_blank');
  if (!w) return toast('Tillad pop op-vindue for at printe', 'warn');
  w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* bruger kan selv printe */ } }, 500);
}

// ---- Sektion: Personer / vidner ----
function roleSelect(p) {
  return el('select', { class: 'roleselect', onchange: (e) => patch(p, 'role', e.target.value) },
    ...ROLES.map((r) => el('option', p.role === r ? { value: r, selected: 'selected' } : { value: r }, r)));
}
function renderPersoner(c) {
  c.people = c.people || [];
  const wrap = el('div', { class: 'peopleview' },
    el('div', { class: 'pv-bar' }, el('button', { class: 'btn primary', onclick: () => { c.people.unshift(newPerson()); save(); renderCase(); } }, '➕ Tilføj person')));
  if (!c.people.length) { wrap.append(el('p', { class: 'muted' }, 'Ingen personer endnu. Tilføj parter, vidner og advokater — og knyt begivenheder til dem fra tidslinjen.')); return wrap; }
  for (const p of c.people) {
    const evs = sortEvents((c.events || []).filter((e) => (e.people || []).includes(p.id)));
    wrap.append(el('div', { class: 'personcard' },
      el('div', { class: 'pc-head' },
        editable('div', p.name, (v) => patch(p, 'name', v), 'pc-name'),
        roleSelect(p),
        el('span', { class: 'x del', title: 'Slet', onclick: () => { c.people = c.people.filter((x) => x.id !== p.id); save(); renderCase(); } }, '🗑')),
      editable('div', p.note, (v) => patch(p, 'note', v), 'pc-note'),
      el('div', { class: 'pc-events' },
        el('div', { class: 'muted sm' }, evs.length ? 'Vidne-fil — begivenheder med denne person:' : 'Ingen begivenheder knyttet endnu (knyt via en begivenhed på tidslinjen).'),
        ...evs.map((e) => el('div', { class: 'pc-ev', onclick: () => { state.tab = 'tidslinje'; state.expanded.add(e.id); state.selEvent = e.id; renderCase(); } },
          el('span', { class: 'd' }, daDate(e.date)), ' ' + e.title)))));
  }
  return wrap;
}

// ---- Sektion: Frister ----
function renderFrister(c) {
  c.deadlines = c.deadlines || [];
  const wrap = el('div', { class: 'fristview' },
    el('div', { class: 'pv-bar' },
      el('button', { class: 'btn primary', onclick: () => { c.deadlines.unshift(newDeadline()); save(); renderCase(); } }, '➕ Tilføj frist'),
      el('span', { class: 'muted sm' }, 'Rød = overskredet · orange = inden for 7 dage. (Visuelt — der sendes ingen besked.)')));
  if (!c.deadlines.length) { wrap.append(el('p', { class: 'muted' }, 'Ingen frister endnu.')); return wrap; }
  for (const d of [...c.deadlines].sort((a, b) => a.date < b.date ? -1 : 1)) {
    const st = d.done ? 'done' : deadlineStatus(d.date);
    wrap.append(el('div', { class: 'fristrow ' + st },
      el('input', d.done ? { type: 'checkbox', checked: 'checked', onchange: (e) => { patch(d, 'done', e.target.checked); renderCase(); } } : { type: 'checkbox', onchange: (e) => { patch(d, 'done', e.target.checked); renderCase(); } }),
      el('input', { type: 'date', value: d.date, class: 'fdate', onchange: (e) => { patch(d, 'date', e.target.value); renderCase(); } }),
      editable('div', d.title, (v) => patch(d, 'title', v), 'ftitle'),
      el('span', { class: 'fstatus' }, d.done ? '✓ Klaret' : st === 'overdue' ? 'Overskredet' : st === 'soon' ? 'Snart' : ''),
      el('span', { class: 'x del', title: 'Slet', onclick: () => { c.deadlines = c.deadlines.filter((x) => x.id !== d.id); save(); renderCase(); } }, '🗑')));
  }
  return wrap;
}

// ---- Sektion: Søg (med scope-filtre) ----
const kindMeta = (k) => KINDS.find((x) => x.id === k) || { icon: '•', label: k };
function jumpInCase(h) {
  if (h.kind === 'opsummering') { state.tab = 'tidslinje'; state.selSummary = h.refId; state.selEvent = null; renderCase(); return; }
  if (h.kind === 'person') { state.tab = 'personer'; renderCase(); return; }
  state.tab = 'tidslinje'; state.expanded.add(h.refId); state.selEvent = h.refId; state.selSummary = null; renderCase();
}
function resultRow(h, docMap, terms, onJump) {
  const d = docMap[h.id] || {};
  const src = [d.text, d.doctext, d.filename].filter(Boolean).join('  ');
  const snip = el('div', { class: 'sr-snip' }); if (src) highlight(snip, snippet(src, terms), terms);
  return el('div', { class: 'sresult', onclick: onJump },
    el('div', { class: 'sr-head' },
      el('span', { class: 'sr-kind' }, kindMeta(h.kind).icon + ' ' + kindMeta(h.kind).label),
      h.caseTitle && state.view === 'home' ? el('span', { class: 'sr-case' }, h.caseTitle) : null,
      h.date ? el('span', { class: 'sr-date' }, daDate(h.date)) : null,
      el('span', { class: 'sr-title' }, h.title || '(uden titel)')),
    src ? snip : null);
}
function renderResults(container, hits, docMap, query, onJump) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!query.trim()) return container.replaceChildren(el('p', { class: 'muted' }, 'Skriv for at søge.'));
  if (!hits.length) return container.replaceChildren(el('p', { class: 'muted' }, 'Ingen træf for “' + query + '”.'));
  container.replaceChildren(el('div', { class: 'sr-count muted' }, hits.length + ' træf — klik for at hoppe dertil'),
    ...hits.slice(0, 60).map((h) => resultRow(h, docMap, terms, () => onJump(h))));
}
function renderSoeg(c) {
  const wrap = el('div', { class: 'searchview' });
  const input = el('input', { class: 'searchbox', type: 'search', placeholder: 'Søg i sagen — titler, noter, dokument-indhold, personer …' });
  const chipsBar = el('div', { class: 'scopechips' });
  const results = el('div', { class: 'searchresults' }, el('p', { class: 'muted' }, 'Skriv for at søge.'));
  let ms = null, docMap = {}, ready = false;
  const kinds = new Set();
  for (const k of KINDS) {
    const chip = el('span', { class: 'scopechip', onclick: () => { kinds.has(k.id) ? kinds.delete(k.id) : kinds.add(k.id); chip.classList.toggle('on'); update(); } }, k.icon + ' ' + k.label);
    chipsBar.append(chip);
  }
  const update = () => { if (ready) renderResults(results, runSearch(ms, Object.values(docMap), input.value, kinds), docMap, input.value, jumpInCase); };
  input.addEventListener('input', update);
  wrap.append(
    el('div', { class: 'searchbar-row' }, el('span', { class: 'sicon' }, '🔎'), input),
    el('div', { class: 'scoperow' }, el('span', { class: 'muted sm' }, 'Søg kun i (vælg for at filtrere):'), chipsBar),
    results);
  (async () => {
    const fileTexts = {};
    for (const fid of caseFileIds(c)) { const rec = await db.getFile(fid); if (rec && rec.text) fileTexts[fid] = rec.text; }
    const docs = caseToDocs(c, fileTexts); docMap = Object.fromEntries(docs.map((d) => [d.id, d]));
    ms = buildIndex(docs); ready = true; setTimeout(() => input.focus(), 0); update();
  })();
  return wrap;
}

// ---- Global søgning (hjem, på tværs af alle sager) ----
function globalSearchBar() {
  const wrap = el('div', { class: 'globalsearch' });
  const input = el('input', { class: 'searchbox', type: 'search', placeholder: '🔎 Søg på tværs af ALLE dine sager …' });
  const results = el('div', { class: 'searchresults global' });
  const docMap = {};
  for (const c of state.cases) for (const d of caseToDocs(c, {})) docMap[d.id] = d;
  const ms = buildIndex(Object.values(docMap));
  const jumpGlobal = async (h) => {
    await openCaseById(h.caseId);
    state.tab = 'tidslinje';
    if (h.kind === 'opsummering') { state.selSummary = h.refId; } else { state.expanded.add(h.refId); state.selEvent = h.refId; }
    renderCase();
  };
  const update = () => renderResults(results, runSearch(ms, Object.values(docMap), input.value, new Set()), docMap, input.value, jumpGlobal);
  input.addEventListener('input', update);
  wrap.append(el('div', { class: 'searchbar-row big' }, el('span', { class: 'sicon' }, '🔎'), input), results);
  return wrap;
}

// ---------- migration (v1 -> cases) + boot ----------
async function migrateLegacy() {
  if ((await db.listCases()).length) return;
  const legacy = await db.getLegacyCase();
  if (legacy) { legacy.id = legacy.id || uid('case'); legacy.updated = legacy.updated || Date.now(); await db.saveCaseRec(legacy); await db.clearLegacy(); log.ok('app', 'migrerede gammel enkelt-sag'); }
}
(async function boot() {
  try { await db.openDB(); await migrateLegacy(); await navHome(); log.info('app', 'boot', state.cases.length + ' sager'); }
  catch (e) { fail(e); }
})();
