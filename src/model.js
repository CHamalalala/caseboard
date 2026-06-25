// model.js — sagens "hjerne": skema + ren logik (testet). Ingen DOM, ingen IndexedDB her.
export const SCHEMA = 2;
export const TYPES = ['mail', 'dokument', 'handling', 'note'];

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const today = () => new Date().toISOString().slice(0, 10);

export function newCase(title = 'Ny sag') {
  return { id: uid('case'), schema: SCHEMA, title, meta: {}, events: [], summaries: [], people: [], deadlines: [], updated: Date.now() };
}

export function newEvent(p = {}) {
  return {
    id: uid('ev'),
    date: p.date || today(),               // YYYY-MM-DD => sorterbar som streng
    title: (p.title || '').trim() || '(uden titel)',
    type: TYPES.includes(p.type) ? p.type : 'handling',
    parties: p.parties || '',
    body: p.body || '',
    attachments: p.attachments || [],      // [{fileId, name}]
    tags: p.tags || [],                    // etiketter (emne/bevis/...)
    people: p.people || [],                // personId'er knyttet til begivenheden
    time: p.time || '',                    // HH:MM (fx mailens modtage-tidspunkt)
    strength: p.strength || 0,             // bevis-styrke 1–5 (0 = ikke sat)
  };
}

// Argumentkort: påstand → beviskrav (retsfaktum) → bevis. Deterministisk hul-detektion.
export function newClaim(title = 'Ny påstand', i = 0) { return { id: uid('cl'), title, color: SUMMARY_COLORS[i % SUMMARY_COLORS.length], elements: [] }; }
// burden: hvem har bevisbyrden ('mig'|'modpart'); essential: afgørende beviskrav (kumulativt)
export function newElement(text = '') { return { id: uid('el'), text: text || 'Nyt beviskrav', evidence: [], objection: '', rebuttal: '', burden: 'mig', essential: true }; }
export function newCitation(p = {}) { return { id: uid('cit'), eventId: p.eventId || null, fileId: p.fileId || null, page: p.page || '', quote: p.quote || '' }; }

// status pr. beviskrav (til UI): 'ok' (bevis) · 'hul' (mangler bevis OG jeg har byrden) · 'modpart' (modpartens byrde)
export function elementStatus(el) {
  const hasEv = (el.evidence || []).length > 0;
  if (hasEv) return 'ok';
  return (el.burden || 'mig') === 'modpart' ? 'modpart' : 'hul';
}

// sagsstyrke pr. påstand (GLM-jurist-audit): bevisbyrde + korroboration + kumulativt killswitch.
// Bevis kan være begivenhed ELLER citat. Ét AFGØRENDE hul (min byrde) ⇒ påstanden er reelt død (kritisk).
export function claimStrength(claim, events, citations = []) {
  const els = (claim && claim.elements) || [];
  if (!els.length) return { score: 0, gaps: 0, critical: false, label: 'tom' };
  const byId = {}; for (const e of events || []) byId[e.id] = e;
  const citById = {}; for (const ct of citations || []) citById[ct.id] = ct;
  const strengthOf = (id) => {
    if (byId[id]) return byId[id].strength || 3;
    const ct = citById[id]; if (ct) return (byId[ct.eventId] && byId[ct.eventId].strength) || 3;
    return null;
  };
  let sum = 0, gaps = 0, critical = false;
  for (const el of els) {
    const s = (el.evidence || []).map(strengthOf).filter((x) => x != null);
    if (!s.length) {
      if ((el.burden || 'mig') === 'modpart') { sum += 0.6; continue; }   // modpartens byrde → ikke mit problem
      gaps++; if (el.essential !== false) critical = true;                 // mit afgørende hul → kritisk
      continue;
    }
    const base = Math.max(...s) / 5;                                       // stærkeste bevis
    const bonus = Math.min(0.25, (s.length - 1) * 0.06);                   // korroboration: flere uafhængige beviser løfter
    sum += Math.min(1, base + bonus);
  }
  let score = sum / els.length;
  if (critical) score = Math.min(score, 0.2);                             // ét kritisk hul ⇒ påstanden er død
  const label = critical ? 'kritisk hul' : score >= 0.7 ? 'stærk' : score >= 0.4 ? 'middel' : 'svag';
  return { score, gaps, critical, label };
}

export const ROLES = ['Klient', 'Modpart', 'Vidne', 'Advokat', 'Dommer', 'Andet'];
// DK frist-motor — vejledende danske procesfrister (advokat verificerer altid; ikke juridisk rådgivning)
export const DK_FRISTER = [
  { id: 'anke_civil', label: 'Ankefrist, civil dom', days: 28 },
  { id: 'kaeremaal', label: 'Kæremål (kendelse)', days: 14 },
  { id: 'anke_straf', label: 'Ankefrist, straffedom', days: 14 },
  { id: 'svarfrist', label: 'Svarfrist (svarskrift)', days: 14 },
  { id: 'fuldbyrdelse', label: 'Fuldbyrdelsesfrist (dom)', days: 14 },
  { id: 'fortrydelse', label: 'Fortrydelsesret (forbruger)', days: 14 },
  { id: '3instans', label: '3.-instansbevilling (Procesbevillingsnævnet)', days: 28 },
];
// dato + dage → ny dato; ruller frem til næste hverdag ved weekend (rpl. §148a; helligdage IKKE medregnet)
export function computeDeadline(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newTimeEntry(p = {}) { return { id: uid('t'), date: p.date || today(), minutes: p.minutes || 0, note: p.note || '' }; }
export const sumMinutes = (entries) => (entries || []).reduce((s, e) => s + (Number(e.minutes) || 0), 0);
export function fmtMinutes(m) { m = Math.round(m || 0); const h = Math.floor(m / 60); return h ? `${h} t ${m % 60} min` : `${m} min`; }
export const toHours = (m) => (Math.round((m || 0) / 6) / 10).toFixed(1);   // decimal-timer, 1 decimal
export function newPerson(name = '') { return { id: uid('pe'), name: name || 'Ny person', role: 'Andet', note: '' }; }
export function newDeadline(p = {}) { return { id: uid('dl'), date: p.date || today(), title: p.title || 'Ny frist', done: false }; }

// status for en frist ift. i dag (til farvekodning) — testet
export function deadlineStatus(date, todayStr = today()) {
  if (!date) return 'future';
  if (date < todayStr) return 'overdue';
  const d = new Date(date), t = new Date(todayStr);
  const days = Math.round((d - t) / 86400000);
  return days <= 7 ? 'soon' : 'future';
}

// farver til opsummeringer (hver sin tråd-farve) — distinkte og læsbare
export const SUMMARY_COLORS = ['#e08a00', '#2b5797', '#b4308f', '#2e7d32', '#7a4ec0', '#0f9b9b', '#c0560f', '#444b6e'];
export function newSummary(title = 'Ny opsummering', i = 0) {
  return {
    id: uid('su'), title, body: '', links: [], anchorDate: null,
    x: 16 + (i % 3) * 24, y: 16 + i * 150,           // startposition (spredt, så kort ikke overlapper)
    color: SUMMARY_COLORS[i % SUMMARY_COLORS.length],
  };
}

// Dokument-type ud fra mime/filnavn → styrer preview + ikon.
export function fileKind(mime = '', name = '') {
  const m = (mime || '').toLowerCase(), n = (name || '').toLowerCase();
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m.includes('word') || m.includes('officedocument') || /\.(docx?|rtf|odt)$/.test(n)) return 'word';
  return 'other';
}
export const kindIcon = (k) => ({ image: '🖼️', pdf: '📄', word: '📝', other: '📎' }[k] || '📎');

// KERNE-LOGIK (testet): kronologisk sortering. ISO-datoer sorteres korrekt som strenge.
export function sortEvents(events) {
  return [...events].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.title < b.title ? -1 : 1));
}

// KERNE-LOGIK (testet): hvor skal et nyt event ind, så rækken forbliver sorteret.
export function insertIndex(sortedEvents, date) {
  let i = 0;
  while (i < sortedEvents.length && sortedEvents[i].date <= date) i++;
  return i;
}

// Dansk datovisning fra ISO.
export function daDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
