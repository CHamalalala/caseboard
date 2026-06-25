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
  };
}

export const ROLES = ['Klient', 'Modpart', 'Vidne', 'Advokat', 'Dommer', 'Andet'];
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
