// picker.js — interaktiv sags-vælger SOM popup direkte i mailen (Gmail/Outlook). Loadet FØR gmail/outlook.js.
// Shadow DOM → mail-sidens CSS kan ikke ødelægge popup'en (og omvendt). Læser sags-listen fra chrome.storage.local
// (synket fra CaseBoard). Returnerer {targets:{caseIds:[],newCase:bool}, email:redigeret} eller null (annulleret).
(function () {
  'use strict';
  const NS = 'http://www.w3.org/1999/xhtml';
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const k in (props || {})) { if (k === 'style') e.style.cssText = props[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); }
    for (const c of kids) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };

  async function getCaseList() {
    try { const { caseList = [] } = await chrome.storage.local.get('caseList'); return Array.isArray(caseList) ? caseList : []; }
    catch { return []; }
  }

  // D2: opdag en frist i mailteksten (frist-ord + en konkret dato, ELLER "X dage/uger" relativt). Returnerer {date,title}|null.
  function detectDeadline(text) {
    if (!text) return null;
    const FRIST = /(frist|senest|inden|forfald|betal\w*|underskr\w*|svar\w*|tilbagemeld\w*)/i;
    const sd = (window.__cbDate || {}).parseSmartDate;
    const pad = (x) => String(x).padStart(2, '0');
    for (const seg of text.split(/[\n.;]/)) {
      if (!FRIST.test(seg) || !sd) continue;
      // isolér dato-substrings (undgå at beløb som "250.000" forstyrrer parseren) og prøv hver
      const ms = seg.match(/\b\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\b|\b\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zæøå.]*\s*\d{0,4}/gi) || [];
      for (const dm of ms) { const d = sd(dm); if (d && d.date) return { date: d.date, title: ('Frist: ' + seg.trim()).slice(0, 60) }; }
    }
    const rel = text.match(/(\d{1,2})\s*(dage?|uger?)/i);
    if (rel && FRIST.test(text)) { const n = +rel[1] * (/uge/i.test(rel[2]) ? 7 : 1); const d = new Date(); d.setDate(d.getDate() + n); return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, title: 'Frist (' + rel[0].trim() + ')' }; }
    return null;
  }

  const CSS = `
  :host{all:initial}
  .back{position:fixed;inset:0;background:rgba(10,16,32,.55);display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Arial,sans-serif}
  .card{background:#fff;color:#1a1a1a;width:380px;max-width:94vw;max-height:88vh;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
  .hd{background:#14213d;color:#fff;padding:14px 18px;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px}
  .bd{padding:14px 18px;overflow:auto}
  .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:10px 0 4px}
  .in{width:100%;box-sizing:border-box;border:1px solid #d4d9e3;border-radius:9px;padding:9px 11px;font-size:14px;color:#14213d;background:#fff}
  .in:focus{outline:2px solid #1a7f37;border-color:#1a7f37}
  .ta{min-height:78px;max-height:170px;resize:vertical;font:13px/1.45 "Segoe UI",Arial,sans-serif}
  .extra{display:flex;flex-direction:column;gap:6px;border:1px solid #eef0f4;border-radius:10px;padding:6px}
  .row2{display:flex;gap:8px}
  .row2 .in{flex:1}
  .search{margin:4px 0 8px}
  .cases{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow:auto;border:1px solid #eef0f4;border-radius:10px;padding:6px}
  .opt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent}
  .opt:hover{background:#f4f6fb}
  .opt.on{background:#e9f6ee;border-color:#1a7f37}
  .opt input{width:17px;height:17px;accent-color:#1a7f37;cursor:pointer}
  .opt .t{font-size:14px;font-weight:600;color:#14213d;line-height:1.2}
  .opt .s{font-size:11px;color:#8b93a3}
  .new{margin-top:6px;border-style:dashed;border-color:#b9c0cf}
  .empty{font-size:13px;color:#6b7280;padding:10px;background:#f7f8fb;border-radius:9px}
  .ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid #eef0f4;background:#fbfcfe}
  .btn{border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
  .ghost{background:#eef0f4;color:#39414f}
  .add{background:#1a7f37;color:#fff}
  .add:disabled{background:#b9c0cf;cursor:not-allowed}
  .muted{color:#8b93a3;font-size:12px;margin-top:6px}`;

  function open(email) {
    return new Promise(async (resolve) => {
      if (document.getElementById('cb-picker-host')) { resolve(null); return; }   // guard mod dobbelt-åbning (GLM P1)
      email = email || {};
      const prevFocus = document.activeElement;                                    // gendannes ved luk
      const host = h('div', { id: 'cb-picker-host', style: 'all:initial;position:fixed;inset:0;z-index:2147483647' });
      const root = host.attachShadow({ mode: 'open' });
      root.append(h('style', {}, CSS));
      document.body.appendChild(host);     // append SYNKRONT (FØR await) → guarden fanger samtidige kald (TOCTOU-fix)
      const cases = await getCaseList();

      const sel = new Set();
      let newCase = false;

      // redigerbar forhåndsvisning
      const subj = h('input', { class: 'in', value: email.subject || '', placeholder: 'Emne' });
      const date = h('input', { class: 'in', type: 'date', value: email.date || '' });
      const time = h('input', { class: 'in', type: 'time', value: email.time || '' });
      const from = h('input', { class: 'in', value: email.from || '', placeholder: 'Afsender' });
      const bodyArea = h('textarea', { class: 'in ta', rows: '4', placeholder: 'Mailens indhold (følger med i sagen)' });
      bodyArea.value = email.bodyText || '';
      // D3: afsender → Personer (vises kun hvis vi har en afsender)
      const hasFrom = !!(email.from && email.from.trim());
      const personCb = h('input', { type: 'checkbox' }); personCb.checked = hasFrom;
      const personRow = hasFrom ? h('label', { class: 'opt on' }, personCb, h('div', {}, h('div', { class: 't' }, '➕ Tilføj afsender til Personer'), h('div', { class: 's' }, email.from))) : null;
      if (personRow) personCb.addEventListener('change', () => personRow.classList.toggle('on', personCb.checked));
      // D2: auto-opdag frist i mailteksten → forslag
      const det = detectDeadline(email.bodyText || '');
      let deadlineCb = null, deadlineRow = null;
      if (det) { deadlineCb = h('input', { type: 'checkbox' }); deadlineCb.checked = true; deadlineRow = h('label', { class: 'opt on' }, deadlineCb, h('div', {}, h('div', { class: 't' }, '📅 Opret frist'), h('div', { class: 's' }, det.title + ' — ' + det.date))); deadlineCb.addEventListener('change', () => deadlineRow.classList.toggle('on', deadlineCb.checked)); }
      const extra = (personRow || deadlineRow) ? h('div', { class: 'extra' }, personRow, deadlineRow) : null;
      const search = h('input', { class: 'in search', type: 'search', placeholder: '🔎 Søg i sager…' });

      const addBtn = h('button', { class: 'btn add', disabled: 'true' }, 'Tilføj');
      const refreshAdd = () => {
        const n = sel.size + (newCase ? 1 : 0);
        addBtn.textContent = n ? `Tilføj til ${n} sag${n > 1 ? 'er' : ''}` : 'Vælg en sag';
        if (n) addBtn.removeAttribute('disabled'); else addBtn.setAttribute('disabled', 'true');
      };

      const list = h('div', { class: 'cases' });
      const rows = [];
      const buildRows = (q) => {
        list.textContent = ''; rows.length = 0;
        const ql = (q || '').toLowerCase().trim();
        const shown = cases.filter((c) => !ql || (c.title || '').toLowerCase().includes(ql));
        if (!cases.length) {
          list.append(h('div', { class: 'empty' }, 'Ingen sager fundet endnu. Åbn CaseBoard én gang, så henter jeg dine sager — eller opret en ny sag fra mailen nedenfor.'));
          return;
        }
        if (!shown.length) { list.append(h('div', { class: 'empty' }, 'Ingen sager matcher søgningen.')); return; }
        for (const c of shown) {
          const cb = h('input', { type: 'checkbox' }); cb.checked = sel.has(c.id);
          const row = h('label', { class: 'opt' + (sel.has(c.id) ? ' on' : '') }, cb,
            h('div', {}, h('div', { class: 't' }, c.title || '(uden titel)'), h('div', { class: 's' }, (c.n || 0) + ' begivenheder')));
          cb.addEventListener('change', () => { if (cb.checked) sel.add(c.id); else sel.delete(c.id); row.classList.toggle('on', cb.checked); refreshAdd(); });
          rows.push(row); list.append(row);
        }
      };
      buildRows('');
      search.addEventListener('input', () => buildRows(search.value));

      // ➕ ny sag
      const newCb = h('input', { type: 'checkbox' });
      const newRow = h('label', { class: 'opt new' }, newCb,
        h('div', {}, h('div', { class: 't' }, '➕ Ny sag fra mailen'), h('div', { class: 's' }, 'opretter en sag på mailens emne')));
      newCb.addEventListener('change', () => { newCase = newCb.checked; newRow.classList.toggle('on', newCb.checked); refreshAdd(); });

      const cleanup = (val) => { document.removeEventListener('keydown', onKey, true); host.remove(); try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ } resolve(val); };
      const focusables = () => [...root.querySelectorAll('input,button,[tabindex]')].filter((x) => !x.disabled && x.offsetParent !== null);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); cleanup(null); return; }
        if (e.key === 'Tab') {                                   // focus-trap: hold Tab inde i popup'en (GLM P1, a11y)
          const f = focusables(); if (!f.length) return;
          const a = root.activeElement, first = f[0], last = f[f.length - 1];
          if (e.shiftKey && (a === first || !root.contains(a))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);

      addBtn.addEventListener('click', () => {
        // bevar ALTID den formaterede original (bodyHtml) — GLM: ryd den ikke ved en lille tekst-rettelse.
        // Kun hvis der slet ingen formateret original var (fx blokeret-indhold-mail), bruges den indtastede tekst som body.
        const edited = Object.assign({}, email, {
          subject: subj.value.trim() || '(uden emne)', date: date.value || email.date, time: time.value || '', from: from.value.trim(),
          bodyText: bodyArea.value,
        });
        const opts = { addPerson: !!(personCb.checked && hasFrom), person: from.value.trim() || email.from || '', deadline: (deadlineCb && deadlineCb.checked) ? det : null };
        cleanup({ targets: { caseIds: [...sel], newCase }, email: edited, opts });
      });

      const back = h('div', { class: 'back', onclick: (e) => { if (e.target === back) cleanup(null); } },
        h('div', { class: 'card' },
          h('div', { class: 'hd' }, '📎 Tilføj mail til sag'),
          h('div', { class: 'bd' },
            h('div', { class: 'lbl' }, 'Mail'),
            subj,
            h('div', { class: 'row2', style: 'margin-top:8px' }, date, time),
            h('div', { style: 'margin-top:8px' }, from),
            h('div', { class: 'lbl' }, 'Indhold'),
            bodyArea,
            extra ? h('div', { class: 'lbl' }, 'Tilføj automatisk') : null,
            extra,
            h('div', { class: 'lbl' }, 'Hvilke sager skal den i?'),
            search, list, newRow,
            h('div', { class: 'muted' }, 'Vælg én eller flere — tilføjes uden at forlade mailen.')),
          h('div', { class: 'ft' },
            h('button', { class: 'btn ghost', onclick: () => cleanup(null) }, 'Annullér'),
            addBtn)));
      root.append(back);
      setTimeout(() => (cases.length ? search : subj).focus(), 30);
    });
  }

  window.__cbPicker = { open };

  // D1: hent mailens bilag som blobs (kører i mail-sidens kontekst → same-origin + brugerens session).
  // Returnerer [{name,mime,dataUrl}] for hentede + {name,missing/tooBig} for dem vi ikke kunne tage med.
  async function fetchAll(atts) {
    const MAX_FILE = 9 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024;
    const out = []; let total = 0;
    for (const a of (atts || [])) {
      if (!a || !a.url) { out.push({ name: a && a.name, mime: a && a.mime, missing: true }); continue; }
      try {
        const resp = await fetch(a.url, { credentials: 'include' });
        if (!resp.ok) { out.push({ name: a.name, mime: a.mime, missing: true }); continue; }
        const blob = await resp.blob();
        if (blob.size > MAX_FILE || total + blob.size > MAX_TOTAL) { out.push({ name: a.name, mime: a.mime, tooBig: true }); continue; }
        total += blob.size;
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
        if (dataUrl) out.push({ name: a.name, mime: a.mime || blob.type, dataUrl }); else out.push({ name: a.name, mime: a.mime, missing: true });
      } catch (e) { out.push({ name: a.name, mime: a.mime, missing: true }); }
    }
    return out;
  }
  window.__cbFiles = { fetchAll };
})();
