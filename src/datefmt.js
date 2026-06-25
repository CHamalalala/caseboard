// datefmt.js — robust dato-parser (dansk + relative + ISO/RFC822). Returnerer {date:'YYYY-MM-DD', time:'HH:MM'|''}
// (LOKAL tid, samme basis → dato/tid modsiger aldrig hinanden). Returnerer null hvis intet kan udledes.
// VIGTIGT: holdes i sync med extension/datefmt.js (udvidelsen kan ikke importere ES-moduler).

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d, hasTime) => ({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '' });
const parseTime = (s) => { const m = String(s).match(/\b(\d{1,2})[:.](\d{2})\b/); return m && +m[1] < 24 && +m[2] < 60 ? { h: +m[1], min: +m[2] } : null; };

export function parseSmartDate(input, now = new Date()) {
  if (input == null) return null;
  const s = String(input).trim(); if (!s) return null;
  const low = s.toLowerCase();
  const time = parseTime(s);
  const withTime = (d) => { if (time) d.setHours(time.h, time.min, 0, 0); return fmt(d, !!time); };

  // 1) RELATIVE
  if (/\bi\s*dag\b|idag/.test(low) || /^kl\.?\s*\d/.test(low)) return withTime(new Date(now));
  if (/\bi\s*går\b|igår/.test(low)) { const d = new Date(now); d.setDate(d.getDate() - 1); return withTime(d); }
  let rel = low.match(/for\s+(\d+)\s*(minut|min|time|timer|dag|dage|uge|uger)/) || low.match(/(\d+)\s*(minut|min|time|timer|dag|dage|uge|uger)\s*siden/);
  if (rel) {
    const n = +rel[1], u = rel[2], d = new Date(now);
    if (/min/.test(u)) d.setMinutes(d.getMinutes() - n);
    else if (/time/.test(u)) d.setHours(d.getHours() - n);
    else if (/uge/.test(u)) d.setDate(d.getDate() - n * 7);
    else d.setDate(d.getDate() - n);
    return fmt(d, /min|time/.test(u));
  }

  // 2) DANSK talformat: dd[-./ ]mm([-./ ]åååå)?  (dag før måned — DK)
  let m = s.match(/\b(\d{1,2})[-./](\d{1,2})(?:[-./](\d{2,4}))?\b/);
  if (m) {
    const day = +m[1], mon = +m[2] - 1; let yr = m[3] ? +m[3] : now.getFullYear();
    if (yr < 100) yr += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) return withTime(new Date(yr, mon, day));
  }

  // 3) DANSKE månedsnavne: "16. juni 2026" / "16 jun 2026"
  m = low.match(/\b(\d{1,2})\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zæøå.]*\s*(\d{4})?/);
  if (m && MONTHS[m[2]] != null) { const yr = m[3] ? +m[3] : now.getFullYear(); return withTime(new Date(yr, MONTHS[m[2]], +m[1])); }

  // 4) ISO / RFC822 / engelske månedsnavne → lad Date prøve (kun hvis det LIGNER en rigtig dato)
  if (/\d{4}-\d{2}-\d{2}/.test(s) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s) || /\b\d{4}\b.*\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) return fmt(d, /\d{1,2}:\d{2}/.test(s));
  }

  // 5) kun et klokkeslæt → i dag
  if (time && /^\s*(kl\.?\s*)?\d{1,2}[:.]\d{2}\s*$/.test(low)) return withTime(new Date(now));

  return null;
}

// prøv flere kilde-strenge (datetime-attr → title → tekst); fald tilbage til I DAG hvis intet rammer.
export function pickDate(strings, now = new Date()) {
  for (const s of strings || []) { const r = s && parseSmartDate(s, now); if (r) return r; }
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: '' };
}
