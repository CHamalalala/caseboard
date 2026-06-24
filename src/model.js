// model.js — sagens "hjerne": skema + ren logik (testet). Ingen DOM, ingen IndexedDB her.
export const SCHEMA = 2;
export const TYPES = ['mail', 'dokument', 'handling', 'note'];

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const today = () => new Date().toISOString().slice(0, 10);

export function newCase(title = 'Ny sag') {
  return { schema: SCHEMA, title, meta: {}, events: [], summaries: [] };
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
  };
}

export function newSummary(title = 'Ny opsummering') {
  return { id: uid('su'), title, body: '', links: [] }; // links: [{refId, label}]
}

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
