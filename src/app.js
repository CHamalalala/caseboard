// app.js — controller: binder model + db + ui sammen. Gemmer ved hver ændring.
import { log } from './log.js';
import { Err, AppError } from './errors.js';
import * as db from './db.js';
import { newCase, newEvent, newSummary, sortEvents, daDate, TYPES, today } from './model.js';
import { el, toast, insertModal } from './ui.js';

const root = () => document.getElementById('app');
const state = { case: null };

// ---------- fil-hjælpere (til eksport/import) ----------
const blobToB64 = (blob) => new Promise((res) => {
  const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob);
});
const b64ToBlob = (b64, mime) => {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
};
const save = () => db.saveCase(state.case).catch((e) => fail(e));
function fail(e) {
  const a = e instanceof AppError ? `${e.code}: ${e.message}` : (e?.message || e);
  log.err('app', a, e); toast('Fejl — ' + a, 'err');
}

// ---------- handlinger ----------
async function addEventFromModal() {
  const data = await insertModal({ TYPES, today });
  if (!data) return;
  const attachments = [];
  if (data.file) {
    const id = 'file_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await db.putFile(id, { name: data.file.name, mime: data.file.type, blob: data.file });
    attachments.push({ fileId: id, name: data.file.name });
  }
  state.case.events.push(newEvent({ ...data, attachments }));
  await save(); render();
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

function addSummary() { state.case.summaries.unshift(newSummary()); save(); render(); }

function linkToSummary(summaryId, ref) {
  const s = state.case.summaries.find((x) => x.id === summaryId);
  if (s && !s.links.some((l) => l.refId === ref.refId)) { s.links.push(ref); save(); render(); }
}

async function exportCase() {
  try {
    const files = await db.allFiles();
    const out = { app: 'caseboard', exported: new Date().toISOString(), case: state.case, files: {} };
    for (const [id, rec] of Object.entries(files))
      out.files[id] = { name: rec.name, mime: rec.mime, b64: await blobToB64(rec.blob) };
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: (state.case.title || 'sag').replace(/\s+/g, '-') + '.caseboard.json' });
    a.click();
    toast('Sag eksporteret', 'ok');
  } catch (e) { fail(Err.export('eksport fejlede', e)); }
}

async function importData(data) {
  if (!data || !data.case) throw Err.import('ikke en gyldig CaseBoard-fil');
  await db.clearAll();
  for (const [id, f] of Object.entries(data.files || {})) await db.putFile(id, { name: f.name, mime: f.mime, blob: b64ToBlob(f.b64, f.mime) });
  state.case = data.case;
  await save(); render();
  toast('Sag importeret: ' + (state.case.title || ''), 'ok');
}

async function importCase(file) {
  try { await importData(JSON.parse(await file.text())); }
  catch (e) { fail(e instanceof AppError ? e : Err.import('import fejlede', e)); }
}

// Fiktiv demo (INGEN rigtige sags-data) — så det er sikkert at hoste offentligt.
async function loadDemo() {
  try {
    const ev = (date, title, type, body) => ({ id: 'd_' + date + type, date, title, type, parties: '', body, attachments: [] });
    await importData({ app: 'caseboard', case: {
      schema: 2, title: 'Demo: Eksempelsag (fiktiv)', meta: { note: 'Kun til at vise hvordan værktøjet virker' },
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
    toast('Demo indlæst — prøv “➕ Indsæt” og træk en begivenhed ind i en opsummering', 'ok');
  } catch (e) { fail(e); }
}

function newBlankCase() {
  if (!confirm('Start en ny, tom sag? Den nuværende ryddes fra browseren (eksportér først hvis du vil gemme).')) return;
  db.clearAll().then(() => { state.case = newCase(); save(); render(); });
}

// ---------- render ----------
function editable(tag, value, onsave, cls = '') {
  const n = el(tag, { class: 'edit ' + cls, contenteditable: 'true' }, value || '');
  n.addEventListener('blur', () => onsave(n.textContent.trim()));
  return n;
}

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
      el('span', { class: 'chip del', title: 'Slet', onclick: () => { state.case.events = state.case.events.filter((x) => x.id !== ev.id); save(); render(); } }, '✕')));
  card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ refId: ev.id, label: daDate(ev.date) + ' — ' + ev.title })));
  return card;
}

function summaryCard(su) {
  const drop = el('div', { class: 'links' }, ...su.links.map((l) =>
    el('span', { class: 'chip link' }, l.label,
      el('b', { class: 'x', onclick: () => { su.links = su.links.filter((y) => y.refId !== l.refId); save(); render(); } }, ' ✕'))));
  const card = el('div', { class: 'card summary' },
    el('div', { class: 'su-head' },
      editable('span', su.title, (v) => patch(su, 'title', v), 'title'),
      el('span', { class: 'x del', title: 'Slet', onclick: () => { state.case.summaries = state.case.summaries.filter((x) => x.id !== su.id); save(); render(); } }, '🗑')),
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

function render() {
  const c = state.case;
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand' }, '⚖️ CaseBoard'),
    c ? editable('div', c.title, (v) => patch(c, 'title', v), 'casetitle') : el('div', { class: 'casetitle' }, ''),
    el('div', { class: 'tools' },
      c ? el('button', { class: 'btn primary', onclick: addEventFromModal }, '➕ Indsæt') : null,
      c ? el('button', { class: 'btn', onclick: addSummary }, '＋ Opsummering') : null,
      c ? el('button', { class: 'btn ghost', onclick: exportCase }, '⤓ Eksportér') : null,
      el('label', { class: 'btn ghost file' }, '⤒ Importér',
        el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => e.target.files[0] && importCase(e.target.files[0]) })),
      c ? el('button', { class: 'btn ghost', onclick: newBlankCase }, 'Ny sag') : null));

  const body = el('div', { class: 'layout' });
  if (!c) {
    body.append(el('div', { class: 'empty' },
      el('h2', {}, 'Velkommen til CaseBoard'),
      el('p', {}, 'Et privat værktøj til at føre en sag: tidslinje, beviser, dokumenter og dine egne opsummeringer. Alt gemmes lokalt på din maskine.'),
      el('div', { class: 'tools' },
        el('button', { class: 'btn primary', onclick: () => { state.case = newCase('Ny sag'); save(); render(); } }, 'Start ny sag'),
        el('button', { class: 'btn', onclick: loadDemo }, 'Indlæs demo (fiktiv)'),
        el('label', { class: 'btn ghost file' }, 'Importér sag (.json)',
          el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => e.target.files[0] && importCase(e.target.files[0]) })))));
  } else {
    const timeline = el('main', { class: 'timeline' },
      el('h2', {}, 'Tidslinje'),
      ...(c.events.length ? sortEvents(c.events).map(eventCard) : [el('p', { class: 'muted' }, 'Ingen begivenheder endnu. Tryk “➕ Indsæt”.')]));
    const side = el('aside', { class: 'summaries' },
      el('h2', {}, 'Mine opsummeringer'),
      el('p', { class: 'muted' }, 'Træk begivenheder fra tidslinjen ind i et kort.'),
      ...(c.summaries.length ? c.summaries.map(summaryCard) : [el('p', { class: 'muted' }, 'Ingen endnu — tryk “＋ Opsummering”.')]));
    body.append(timeline, side);
  }
  const r = root(); r.replaceChildren(header, body);
}

// ---------- boot ----------
(async function boot() {
  try {
    await db.openDB();
    state.case = await db.loadCase();
    log.info('app', 'boot', state.case ? 'sag indlæst' : 'ingen sag');
    render();
  } catch (e) { fail(e); render(); }
})();
