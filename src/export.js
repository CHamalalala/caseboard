// export.js — eksportér en sag som en DELBAR PAKKE (zip med mappe-struktur).
// Indhold: Bilag/ (originale filer, nummereret) · Sagsoversigt.html (læsbar, links til bilag) ·
// sag.caseboard.json (til gen-import i CaseBoard) · LÆS-MIG.txt. Gør deling kollega-til-kollega nem.
import { zipSync, strToU8 } from '../vendor/fflate.min.js';
import { daDate, sortEvents } from './model.js';

const safe = (s) => (s || 'fil').replace(/[\\/:*?"<>|\n\r]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// fileRecs: { fileId: { name, mime, bytes:Uint8Array } } ; jsonString: indholdet af .caseboard.json
export function buildShareZip(c, fileRecs, jsonString) {
  const folder = safe(c.title || 'sag');
  const evs = sortEvents(c.events || []);
  const zip = {};
  // 1) Bilag/ — nummereret efter forekomst i tidslinjen
  const bilagPath = {}; let n = 0;
  for (const ev of evs) for (const a of ev.attachments || []) {
    if (!a.fileId || bilagPath[a.fileId]) continue;
    n++; const rec = fileRecs[a.fileId];
    const rel = `Bilag/B${String(n).padStart(2, '0')} ${safe(rec?.name || a.name || 'bilag')}`;
    bilagPath[a.fileId] = rel;
    if (rec?.bytes) zip[rel] = rec.bytes;
  }
  // 2) Sagsoversigt.html
  zip['Sagsoversigt.html'] = strToU8(overviewHtml(c, evs, bilagPath));
  // 3) gen-import-fil
  if (jsonString) zip['sag.caseboard.json'] = strToU8(jsonString);
  // 4) LÆS-MIG
  zip['LÆS-MIG.txt'] = strToU8(readme(c));
  // pak (mappe i roden)
  const wrapped = {}; for (const [p, v] of Object.entries(zip)) wrapped[`${folder}/${p}`] = v;
  return { folder, bytes: zipSync(wrapped, { level: 6 }) };
}

function overviewHtml(c, evs, bilagPath) {
  const row = (ev) => {
    const links = (ev.attachments || []).map((a) => bilagPath[a.fileId]
      ? `<a href="${esc(bilagPath[a.fileId])}">📎 ${esc(a.name)}</a>` : `<span>📎 ${esc(a.name)}</span>`).join(' ');
    return `<div class="ev"><div class="d">${esc(daDate(ev.date))}</div><div class="c">
      <div class="t"><span class="k">${esc(ev.type || '')}</span> ${esc(ev.title)}</div>
      ${ev.parties ? `<div class="p">${esc(ev.parties)}</div>` : ''}
      ${ev.body ? `<div class="b">${esc(ev.body)}</div>` : ''}
      ${links ? `<div class="l">${links}</div>` : ''}</div></div>`;
  };
  const sums = (c.summaries || []).map((s) => `<div class="su"><h3>${esc(s.title)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ''}
    ${(s.links || []).length ? `<ul>${s.links.map((l) => `<li>${esc(l.label)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  return `<!DOCTYPE html><html lang="da"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} — sagsoversigt</title><style>
body{font-family:"Segoe UI",Arial,sans-serif;color:#1a1a1a;background:#f4f6fb;margin:0;padding:24px;line-height:1.5}
.wrap{max-width:900px;margin:0 auto}h1{color:#14213d}h2{color:#2b5797;border-bottom:2px solid #e2e6ee;padding-bottom:6px;margin-top:28px}
.ev{display:flex;gap:12px;background:#fff;border:1px solid #e2e6ee;border-left:4px solid #2b5797;border-radius:8px;padding:10px 12px;margin:0 0 8px}
.d{font-weight:800;color:#2b5797;white-space:nowrap;min-width:92px}.t{font-weight:700;color:#14213d}
.k{font-size:10px;text-transform:uppercase;background:#9aa7bd;color:#fff;border-radius:3px;padding:1px 6px;letter-spacing:.4px}
.p{font-size:13px;color:#6b7280;margin-top:2px}.b{font-size:13px;color:#333;margin-top:6px;white-space:pre-wrap}
.l{margin-top:8px;display:flex;gap:10px;flex-wrap:wrap}.l a{color:#2b5797;font-weight:600;text-decoration:none}.l a:hover{text-decoration:underline}
.su{background:#fff;border:1px solid #e2e6ee;border-left:4px solid #a3360b;border-radius:8px;padding:10px 14px;margin:0 0 10px}.su h3{margin:0 0 6px;color:#14213d}
.note{color:#5b6678;font-size:13px;margin:6px 0 18px}
</style></head><body><div class="wrap">
<h1>⚖️ ${esc(c.title)}</h1>
<div class="note">Sagsoversigt genereret af CaseBoard. Klik et bilag for at åbne originalen (ligger i mappen <b>Bilag/</b>).
For at redigere sagen: åbn CaseBoard og importér <b>sag.caseboard.json</b>.</div>
${Object.keys(c.meta || {}).length ? `<p>${Object.entries(c.meta).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' &nbsp;·&nbsp; ')}</p>` : ''}
<h2>Tidslinje (${evs.length})</h2>${evs.map(row).join('') || '<p>Ingen begivenheder.</p>'}
${sums ? `<h2>Opsummeringer</h2>${sums}` : ''}
</div></body></html>`;
}

function readme(c) {
  return `CASEBOARD — DELT SAG: ${c.title}
=====================================================

Denne mappe indeholder hele sagen, klar til at dele og åbne overalt:

1) Sagsoversigt.html   -> Dobbeltklik. Læsbar oversigt over hele forløbet med
                          klikbare links til hvert bilag. Kræver ingen installation.
2) Bilag/              -> Alle originale dokumenter (PDF, Word, billeder), nummereret.
3) sag.caseboard.json  -> Til at åbne/redigere sagen i CaseBoard:
                          gå til https://chamalalala.github.io/caseboard/ -> "Åbn en sag"
                          -> vælg denne fil. (Alt gemmes lokalt; intet sendes på nettet.)

Fortrolighed: filerne ligger kun lokalt hos dig. Del kun mappen med dem, der må se sagen.
`;
}
