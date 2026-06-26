// ui.js — rene DOM-hjælpere: element-builder, modal (Indsæt), toast. Ingen sags-logik her.
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}

export function toast(msg, kind = 'info') {
  const t = el('div', { class: `toast ${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// "Indsæt"-modal: datovælger + felter + fil. Resolver med data (eller null ved annullér).
export function insertModal({ TYPES, today }) {
  return new Promise((resolve) => {
    const date = el('input', { type: 'date', value: today(), class: 'f' });
    const title = el('input', { type: 'text', placeholder: 'Titel (fx "Brev fra Mogens")', class: 'f' });
    const type = el('select', { class: 'f' }, ...TYPES.map((t) => el('option', { value: t }, t)));
    const parties = el('input', { type: 'text', placeholder: 'Fra → Til (valgfrit)', class: 'f' });
    const body = el('textarea', { placeholder: 'Beskrivelse / noter', class: 'f', rows: '4' });
    const file = el('input', { type: 'file', class: 'f' });
    const close = (val) => { back.remove(); resolve(val); };
    const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      el('div', { class: 'modal' },
        el('h3', {}, 'Indsæt nyt bevis / begivenhed'),
        el('label', {}, 'Dato', date),
        el('label', {}, 'Titel', title),
        el('label', {}, 'Type', type),
        el('label', {}, 'Parter', parties),
        el('label', {}, 'Beskrivelse', body),
        el('label', {}, 'Vedhæft fil (valgfrit)', file),
        el('div', { class: 'modal-row' },
          el('button', { class: 'btn ghost', onclick: () => close(null) }, 'Annullér'),
          el('button', { class: 'btn primary', onclick: () => close({
            date: date.value, title: title.value, type: type.value,
            parties: parties.value, body: body.value, file: file.files[0] || null,
          }) }, 'Indsæt'))));
    document.body.append(back);
    title.focus();
  });
}
