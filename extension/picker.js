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

  const CSS = `
  :host{all:initial}
  .back{position:fixed;inset:0;background:rgba(10,16,32,.55);display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Arial,sans-serif}
  .card{background:#fff;color:#1a1a1a;width:380px;max-width:94vw;max-height:88vh;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
  .hd{background:#14213d;color:#fff;padding:14px 18px;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px}
  .bd{padding:14px 18px;overflow:auto}
  .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:10px 0 4px}
  .in{width:100%;box-sizing:border-box;border:1px solid #d4d9e3;border-radius:9px;padding:9px 11px;font-size:14px;color:#14213d;background:#fff}
  .in:focus{outline:2px solid #1a7f37;border-color:#1a7f37}
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
      email = email || {};
      const cases = await getCaseList();
      const host = h('div', { id: 'cb-picker-host', style: 'all:initial;position:fixed;inset:0;z-index:2147483647' });
      const root = host.attachShadow({ mode: 'open' });
      root.append(h('style', {}, CSS));

      const sel = new Set();
      let newCase = false;

      // redigerbar forhåndsvisning
      const subj = h('input', { class: 'in', value: email.subject || '', placeholder: 'Emne' });
      const date = h('input', { class: 'in', type: 'date', value: email.date || '' });
      const time = h('input', { class: 'in', type: 'time', value: email.time || '' });
      const from = h('input', { class: 'in', value: email.from || '', placeholder: 'Afsender' });
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

      const cleanup = (val) => { document.removeEventListener('keydown', onKey, true); host.remove(); resolve(val); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cleanup(null); } };
      document.addEventListener('keydown', onKey, true);

      addBtn.addEventListener('click', () => {
        const edited = Object.assign({}, email, { subject: subj.value.trim() || '(uden emne)', date: date.value || email.date, time: time.value || '', from: from.value.trim() });
        cleanup({ targets: { caseIds: [...sel], newCase }, email: edited });
      });

      const back = h('div', { class: 'back', onclick: (e) => { if (e.target === back) cleanup(null); } },
        h('div', { class: 'card' },
          h('div', { class: 'hd' }, '📎 Tilføj mail til sag'),
          h('div', { class: 'bd' },
            h('div', { class: 'lbl' }, 'Mail'),
            subj,
            h('div', { class: 'row2', style: 'margin-top:8px' }, date, time),
            h('div', { style: 'margin-top:8px' }, from),
            h('div', { class: 'lbl' }, 'Hvilke sager skal den i?'),
            search, list, newRow,
            h('div', { class: 'muted' }, 'Vælg én eller flere — tilføjes uden at forlade mailen.')),
          h('div', { class: 'ft' },
            h('button', { class: 'btn ghost', onclick: () => cleanup(null) }, 'Annullér'),
            addBtn)));
      root.append(back);
      document.body.appendChild(host);
      setTimeout(() => (cases.length ? search : subj).focus(), 30);
    });
  }

  window.__cbPicker = { open };
})();
