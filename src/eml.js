import { parseSmartDate } from './datefmt.js';
// eml.js — pragmatisk .eml-parser (RFC822). Henter Fra/Til/Dato/Emne + body (text/html).
// Dækker de almindelige tilfælde: foldede headers, encoded-words, multipart, quoted-printable/base64, UTF-8.
// Komplekse/sjældne mails kan ramme grænser → vi fejler blødt (returnerer det vi kan).

// robust base64-dekod: strip ugyldige tegn + pad (mange mail-klienter padder ikke korrekt)
function safeAtob(s) { let b = (s || '').replace(/[^A-Za-z0-9+/]/g, ''); while (b.length % 4) b += '='; try { return atob(b); } catch { return ''; } }

function decodeWord(str) {
  return (str || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    try {
      let bytes;
      if (enc.toUpperCase() === 'B') bytes = Uint8Array.from(safeAtob(data), (c) => c.charCodeAt(0));
      else { const s = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); bytes = Uint8Array.from(s, (c) => c.charCodeAt(0)); }
      return new TextDecoder(cs || 'utf-8').decode(bytes);
    } catch { return data; }
  });
}

function decodeBody(raw, cte, charset) {
  let bytes;
  try {
    if (/base64/i.test(cte)) bytes = Uint8Array.from(safeAtob(raw), (c) => c.charCodeAt(0));
    else if (/quoted-printable/i.test(cte)) {
      const s = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
    } else return raw;
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch { return raw; }
}

function headerMap(headerText) {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
  const map = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':'); if (i < 0) continue;
    map[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return map;
}

const charsetOf = (ct) => (ct.match(/charset="?([^";]+)"?/i) || [])[1];

// rens mail-HTML for scripts/handlere (DOMParser eksekverer IKKE — sikkert). Mod XSS når mailen åbnes som dokument.
function sanitizeHtml(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,link,meta,style,base,form').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:|data:text\/html/i.test(a.value)) n.removeAttribute(a.name); }));
    return (doc.body ? doc.body.innerHTML : '').slice(0, 200000);
  } catch { return ''; }
}

function pickBody(body, ct, cte) {
  const boundary = (ct.match(/boundary="?([^";]+)"?/i) || [])[1];
  if (!/multipart/i.test(ct) || !boundary) {
    const text = decodeBody(body, cte, charsetOf(ct));
    return /html/i.test(ct) ? { html: text, text: text.replace(/<[^>]+>/g, ' ') } : { text };
  }
  // alle dele efter første boundary; spring den afsluttende "--boundary--"-markør/tomme dele over (robust ved trunkering)
  const parts = body.split('--' + boundary).slice(1).filter((p) => { const t = p.trim(); return t && !t.startsWith('--'); });
  let plain = '', html = '';
  for (const part of parts) {
    const i = part.indexOf('\n\n');            // body er normaliseret til \n → kun \n\n findes
    if (i < 0) continue;
    const sep = i + 2;
    const ph = headerMap(part.slice(0, sep));
    const pct = ph['content-type'] || ''; const pcte = ph['content-transfer-encoding'] || '';
    const dec = decodeBody(part.slice(sep).trim(), pcte, charsetOf(pct));
    if (/text\/plain/i.test(pct) && !plain) plain = dec;
    else if (/text\/html/i.test(pct) && !html) html = dec;
    else if (/multipart/i.test(pct)) { const inner = pickBody(part.slice(sep), pct, pcte); plain = plain || inner.text || ''; html = html || inner.html || ''; }
  }
  return { text: plain || (html ? html.replace(/<[^>]+>/g, ' ') : ''), html };
}

export function parseEml(raw) {
  const txt = (raw || '').replace(/\r\n/g, '\n');
  const split = txt.indexOf('\n\n');
  const headerText = split < 0 ? txt : txt.slice(0, split);
  const body = split < 0 ? '' : txt.slice(split + 2);
  const h = headerMap(headerText);
  const dt = parseSmartDate(h.date) || { date: '', time: '' };   // robust (RFC822 + fallback)
  const parts = pickBody(body, h['content-type'] || 'text/plain', h['content-transfer-encoding'] || '');
  return {
    subject: decodeWord(h.subject || '(uden emne)').trim(),
    from: decodeWord(h.from || '').trim(),
    to: decodeWord(h.to || '').trim(),
    dateText: h.date || '',
    date: dt.date,
    time: dt.time,
    bodyText: (parts.text || '').trim().slice(0, 30000),
    bodyHtml: sanitizeHtml(parts.html || ''),
  };
}
