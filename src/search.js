// search.js — ultra-præcis, lokal søgning (MiniSearch). Med scope-filtre ("søg kun i ...").
// Indekserer begivenheder (titel/note/parter/filnavn + udtrukket dokument-tekst), opsummeringer og personer.
import MiniSearch from '../vendor/minisearch.min.js';

export const KINDS = [
  { id: 'begivenhed', label: 'Begivenheder', icon: '📅' },
  { id: 'dokument', label: 'Dokument-indhold', icon: '📄' },
  { id: 'opsummering', label: 'Opsummeringer', icon: '🏷' },
  { id: 'person', label: 'Personer', icon: '👤' },
];

// Lav søge-dokumenter ud fra en sag. fileTexts: { fileId: "udtrukket tekst" }.
export function caseToDocs(c, fileTexts = {}) {
  const docs = [];
  for (const ev of c.events || []) {
    const att = ev.attachments || [];
    const docText = att.map((a) => fileTexts[a.fileId] || '').join('\n');
    // begivenhed (titel/note/parter/filnavn)
    docs.push({ id: c.id + ':ev:' + ev.id, kind: 'begivenhed', caseId: c.id, caseTitle: c.title, refId: ev.id,
      date: ev.date, title: ev.title, text: [ev.body, ev.parties].filter(Boolean).join('\n'),
      filename: att.map((a) => a.name).join(' '), doctext: '' });
    // separat "dokument-indhold"-dok så man kan søge KUN inde i dokumenterne
    if (docText.trim()) docs.push({ id: c.id + ':doc:' + ev.id, kind: 'dokument', caseId: c.id, caseTitle: c.title,
      refId: ev.id, date: ev.date, title: att.map((a) => a.name).join(', ') || ev.title, text: '', filename: '', doctext: docText });
  }
  for (const s of c.summaries || []) docs.push({ id: c.id + ':su:' + s.id, kind: 'opsummering', caseId: c.id,
    caseTitle: c.title, refId: s.id, title: s.title, text: s.body || '', filename: '', doctext: '' });
  for (const p of c.people || []) docs.push({ id: c.id + ':pe:' + p.id, kind: 'person', caseId: c.id,
    caseTitle: c.title, refId: p.id, title: p.name, text: [p.role, p.note].filter(Boolean).join(' '), filename: '', doctext: '' });
  return docs;
}

const FIELDS = ['title', 'text', 'filename', 'doctext'];
const STORE = ['kind', 'caseId', 'caseTitle', 'refId', 'date', 'title'];

export function buildIndex(docs) {
  const ms = new MiniSearch({ fields: FIELDS, storeFields: STORE,
    searchOptions: { boost: { title: 3, filename: 2 }, fuzzy: 0.2, prefix: true, combineWith: 'AND' } });
  ms.addAll(docs);
  return ms;
}

// query + valgte kinds (scope). Hybrid: MiniSearch (rangeret/fuzzy/prefix) + substring-fallback
// (fanger sammensatte danske ord / infix, fx "udkast" inde i "Kontraktudkast"). Returnerer hits.
export function runSearch(ms, docs, query, kinds) {
  const q = (query || '').trim(); if (!q) return [];
  const inScope = (kind) => !kinds || !kinds.size || kinds.size === KINDS.length || kinds.has(kind);
  const msHits = ms.search(q).filter((r) => inScope(r.kind));
  const seen = new Set(msHits.map((r) => r.id));
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const sub = [];
  for (const d of docs || []) {
    if (seen.has(d.id) || !inScope(d.kind)) continue;
    const hay = `${d.title} ${d.text} ${d.filename} ${d.doctext}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) {
      sub.push({ id: d.id, kind: d.kind, caseId: d.caseId, caseTitle: d.caseTitle, refId: d.refId, date: d.date, title: d.title });
      seen.add(d.id);
    }
  }
  return [...msHits, ...sub];
}

// lav et lille uddrag med markerede træf (til visning)
export function snippet(text, terms, max = 160) {
  if (!text) return '';
  const low = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = low.indexOf(t.toLowerCase()); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let start = Math.max(0, at - 40); if (at < 0) start = 0;
  let piece = text.slice(start, start + max);
  if (start > 0) piece = '… ' + piece;
  if (start + max < text.length) piece += ' …';
  return piece;
}
export function highlight(node, text, terms) {
  // node = element; sætter tekst med <mark> om træf (ingen innerHTML af brugerdata → sikkert)
  let rest = text; const lowTerms = terms.map((t) => t.toLowerCase());
  while (rest.length) {
    let best = -1, bestTerm = '';
    for (const t of lowTerms) { const i = rest.toLowerCase().indexOf(t); if (i >= 0 && (best < 0 || i < best)) { best = i; bestTerm = t; } }
    if (best < 0) { node.appendChild(document.createTextNode(rest)); break; }
    if (best > 0) node.appendChild(document.createTextNode(rest.slice(0, best)));
    const m = document.createElement('mark'); m.textContent = rest.slice(best, best + bestTerm.length); node.appendChild(m);
    rest = rest.slice(best + bestTerm.length);
  }
}
