// viewer.js — byg en LÅST, KRYPTERET, READ-ONLY viewer (én selvstændig HTML-fil) til at give en advokat.
// Sagen pakkes som payload, krypteres med crypto.js (AES-256-GCM + PBKDF2 600k) → KUN den krypterede envelope
// indlejres i HTML'en. Sags-data findes ALDRIG i klartekst i filen. Åbnes kun med adgangskoden du holder.
// Den genererede fil har INGEN authoring (ingen ny-sag/redigering/værktøj) — kun visning. Kører 100% lokalt.
import { encryptJson } from './crypto.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Hele denne funktion serialiseres (.toString) og køres STANDALONE i den genererede HTML — ingen eksterne referencer.
function viewerRuntime() {
  const $ = (t, p = {}, ...k) => { const n = document.createElement(t); for (const x in p) x === 'html' ? (n.innerHTML = p[x]) : x === 'on' ? Object.entries(p[x]).forEach(([e, f]) => n.addEventListener(e, f)) : n.setAttribute(x, p[x]); k.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c))); return n; };
  const b64ToU8 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const da = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (d || ''); };
  const LOCK = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#a3360b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const CLIP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
  const env = JSON.parse(document.getElementById('cb-env').textContent);

  async function decrypt(password) {
    const salt = b64ToU8(env.salt), iv = b64ToU8(env.iv), data = b64ToU8(env.data);
    const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const aad = new TextEncoder().encode(String(env.app) + ':' + String(env.v));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, data);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function render(payload) {
    const c = payload.case || {}, files = payload.files || {};
    const evs = (c.events || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const wrap = $('div', { class: 'wrap' });
    wrap.append($('h1', {}, c.title || 'Sag'));
    wrap.append($('div', { class: 'note' }, 'Låst sagsvisning — kun til gennemgang. Data vises lokalt i din browser; intet sendes nogen steder.'));
    wrap.append($('h2', {}, `Tidslinje (${evs.length})`));
    for (const ev of evs) {
      const row = $('div', { class: 'ev' }, $('div', { class: 'd' }, da(ev.date)));
      const c2 = $('div', { class: 'c' }, $('div', { class: 't' }, $('span', { class: 'k' }, ev.type || ''), ' ' + (ev.title || '')));
      if (ev.parties) c2.append($('div', { class: 'p' }, ev.parties));
      if (ev.body) c2.append($('div', { class: 'b' }, ev.body));
      const atts = (ev.attachments || []).filter((a) => files[a.fileId]);
      if (atts.length) {
        const l = $('div', { class: 'l' });
        for (const a of atts) { const f = files[a.fileId]; l.append($('a', { href: `data:${f.mime || 'application/octet-stream'};base64,${f.b64}`, download: f.name || a.name || 'bilag', target: '_blank' }, $('span', { html: CLIP }), f.name || a.name || 'bilag')); }
        c2.append(l);
      }
      row.append(c2); wrap.append(row);
    }
    const sums = c.summaries || [];
    if (sums.length) {
      wrap.append($('h2', {}, 'Opsummeringer'));
      for (const s of sums) {
        const su = $('div', { class: 'su' }, $('h3', {}, s.title || ''));
        if (s.body) su.append($('p', {}, s.body));
        if ((s.links || []).length) { const ul = $('ul', {}); (s.links || []).forEach((x) => ul.append($('li', {}, x.label || ''))); su.append(ul); }
        wrap.append(su);
      }
    }
    document.body.replaceChildren(wrap);
  }

  // adgangskode-port
  const err = $('div', { class: 'err' });
  const inp = $('input', { type: 'password', placeholder: 'Adgangskode', autocomplete: 'off' });
  const open = async () => {
    err.textContent = '';
    // kryptering kræver sikker kontekst (file:// ved dobbeltklik, eller https). Ellers er crypto.subtle undefined →
    // giv en KLAR besked i stedet for misvisende "forkert kode" (GLM-review).
    if (!window.crypto || !window.crypto.subtle) { err.textContent = 'Åbn filen lokalt (dobbeltklik) eller via en sikker https-adresse — kryptering virker ikke her.'; return; }
    if (!inp.value) { err.textContent = 'Indtast adgangskoden.'; return; }
    try { render(await decrypt(inp.value)); }
    catch (e) { err.textContent = 'Forkert adgangskode — sagen kunne ikke åbnes.'; inp.value = ''; inp.focus(); }
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  const gate = $('div', { class: 'gate' },
    $('div', { class: 'card' },
      $('div', { class: 'lock', html: LOCK }),
      $('h2', {}, 'Låst sag'),
      $('p', {}, 'Denne sag er krypteret. Indtast adgangskoden for at se den.'),
      inp, err,
      $('button', { class: 'btn', on: { click: open } }, 'Lås op')));
  document.body.replaceChildren(gate);
  inp.focus();
}

const CSS = `
*{box-sizing:border-box}body{font-family:system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a1a;background:#f4f6fb;margin:0;line-height:1.5;-webkit-font-smoothing:antialiased}
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.gate .card{background:#fff;border:1px solid #e8ebf3;border-radius:14px;box-shadow:0 10px 40px rgba(20,33,61,.12);padding:28px 26px;width:min(380px,92vw);text-align:center}
.gate .lock{font-size:30px}.gate h2{color:#14213d;margin:8px 0 4px}.gate p{color:#5b6678;font-size:14px;margin:0 0 14px}
.gate input{width:100%;padding:11px 12px;border:2px solid #e2e6ee;border-radius:9px;font-size:15px;outline:none}
.gate input:focus{border-color:#2b5797}.gate .err{color:#c62828;font-size:13px;min-height:18px;margin:8px 0}
.gate .btn{width:100%;border:0;border-radius:9px;padding:11px;background:#14213d;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.gate .btn:hover{background:#1d2e54}
.wrap{max-width:900px;margin:0 auto;padding:28px 24px}
h1{color:#14213d}h2{color:#2b5797;border-bottom:2px solid #e2e6ee;padding-bottom:6px;margin-top:28px}
.note{color:#5b6678;font-size:13px;margin:6px 0 4px;font-style:italic}
.ev{display:flex;gap:12px;background:#fff;border:1px solid #e8ebf3;border-left:4px solid #2b5797;border-radius:10px;padding:12px 14px;margin:0 0 9px;box-shadow:0 1px 2px rgba(20,33,61,.04),0 3px 10px rgba(20,33,61,.045)}
.d{font-weight:800;color:#2b5797;white-space:nowrap;min-width:92px}.t{font-weight:700;color:#14213d}
.k{font-size:10px;text-transform:uppercase;background:#9aa7bd;color:#fff;border-radius:3px;padding:1px 6px;letter-spacing:.4px}
.p{font-size:13px;color:#6b7280;margin-top:2px}.b{font-size:13px;color:#333;margin-top:6px;white-space:pre-wrap}
.l{margin-top:8px;display:flex;gap:10px;flex-wrap:wrap}.l a{color:#2b5797;font-weight:600;text-decoration:none}.l a:hover{text-decoration:underline}
.su{background:#fff;border:1px solid #e8ebf3;border-left:4px solid #a3360b;border-radius:10px;padding:12px 14px;margin:0 0 10px}.su h3{margin:0 0 6px;color:#14213d}
`;

export async function buildLockedViewer(c, filesObj, password) {
  const payload = JSON.stringify({ case: c, files: filesObj || {} });
  const env = await encryptJson(payload, password);            // AES-256-GCM + PBKDF2 600k — genbrug crypto.js
  const year = new Date().getFullYear();
  const header = `<!--\n  CaseBoard — Låst sagsvisning\n  © ${year} Søren Hussaini. Alle rettigheder forbeholdes.\n  Licenseret UDELUKKENDE til gennemgang af denne ene sag. Kopiering, distribution, reverse-engineering\n  eller genbrug af denne software (helt eller delvist) er ikke tilladt uden skriftlig tilladelse.\n-->`;
  return `<!DOCTYPE html><html lang="da"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${header}
<title>${esc(c.title || 'Sag')} — låst sagsvisning</title>
<style>${CSS}</style></head><body>
<script type="application/json" id="cb-env">${JSON.stringify(env)}</script>
<script>(${viewerRuntime.toString()})();</script>
</body></html>`;
}
