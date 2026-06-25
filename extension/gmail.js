// gmail.js — indsætter "📎 Tilføj til sag"-knap ØVERST (lige efter emnet) og skraber den åbne mail.
(function () {
  'use strict';
  const BTN_ID = 'caseboard-add-btn';

  function scrape() {
    const main = document.querySelector('div[role="main"]') || document;
    const subjectEl = main.querySelector('h2.hP') || document.querySelector('h2[data-thread-perm-id]') || main.querySelector('h2');
    const msg = [...main.querySelectorAll('.adn, .gs')].pop() || main;
    const fromEl = msg.querySelector('.gD, span[email]');
    const toEl = msg.querySelector('.g2, .hb span[email]');
    const dateEl = msg.querySelector('.g3, span.gH .g3, .gK span[title]');
    const bodyEl = msg.querySelector('.a3s, .ii.gt div, .ii.gt');
    const dateRaw = dateEl?.getAttribute('title') || dateEl?.textContent || '';
    const dt = (window.__cbDate || {}).pickDate
      ? window.__cbDate.pickDate([dateEl?.getAttribute('datetime'), dateEl?.getAttribute('title'), dateEl?.textContent])
      : { date: new Date().toISOString().slice(0, 10), time: '' };
    return {
      subject: (subjectEl?.childNodes[0]?.textContent || subjectEl?.textContent || '').trim() || '(uden emne)',
      from: (fromEl?.getAttribute('email') || fromEl?.textContent || '').trim(),
      to: (toEl?.getAttribute('email') || toEl?.textContent || '').trim(),
      dateText: dateRaw.trim(),
      date: dt.date,
      time: dt.time,
      bodyText: (bodyEl?.innerText || '').trim().slice(0, 20000),
      bodyHtml: sanitize(bodyEl?.innerHTML || ''),
    };
  }

  // DOMParser-baseret rens (eksekverer IKKE) — fjerner aktive elementer + farlige url-attributter (defense-in-depth)
  function sanitize(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,iframe,object,embed,link,meta,style,base,form,input,button,svg,math').forEach((n) => n.remove());
      doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => {
        const val = (a.value || '').replace(/[\s -]+/g, '');
        const isUrlAttr = /^(href|src|xlink:href|formaction|action|srcdoc|background|poster|data)$/i.test(a.name);
        const badUrl = /^(javascript|vbscript):|data:text\/html/i.test(val);
        if (/^on/i.test(a.name) || (isUrlAttr && badUrl)) n.removeAttribute(a.name);
      }));
      return (doc.body ? doc.body.innerHTML : '').slice(0, 200000);
    } catch { return ''; }
  }

  function addButton() {
    const subj = document.querySelector('h2.hP');
    if (!subj || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'margin-left:12px;vertical-align:middle;background:#14213d;color:#fff;border:0;border-radius:16px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); e.preventDefault();
      const email = scrape();
      const atts = scrapeAttachments();        // mailens bilag (metadata) — fanget mens DOM'en er åben
      // interaktiv popup DIREKTE i mailen: vælg sag(er), redigér, søg — ingen fane-skift
      const r = window.__cbPicker ? await window.__cbPicker.open(email) : { targets: null, email };
      if (!r) return;                          // annulleret
      let files = [];
      if (atts.length && window.__cbFiles) { btn.textContent = '⏳ Henter bilag…'; files = await window.__cbFiles.fetchAll(atts); }
      chrome.runtime.sendMessage({ type: 'add-mail', email: r.email, targets: r.targets, opts: r.opts, files }, () => {});
      btn.textContent = '⏳ Tilføjer…';
      setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 2600);
    });
    subj.appendChild(btn);   // ØVERST — lige efter emnet
  }
  // D1: Gmail eksponerer bilag via [download_url]="mime:navn:url" (same-origin → kan hentes med session)
  function scrapeAttachments() {
    const out = [], seen = new Set();
    const main = document.querySelector('div[role="main"]') || document;
    for (const el of main.querySelectorAll('[download_url]')) {
      const m = (el.getAttribute('download_url') || '').match(/^([^:]+):([^:]+):(.+)$/);
      if (m && !seen.has(m[3])) { seen.add(m[3]); out.push({ mime: m[1], name: m[2], url: m[3] }); }
    }
    return out;
  }

  // bekræftelse tilbage fra CaseBoard (skrevet af bridge.js) → vis på knappen, ingen fane-skift
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.lastResult || !ch.lastResult.newValue) return;
    const r = ch.lastResult.newValue; const b = document.getElementById(BTN_ID); if (!b) return;
    b.textContent = r.ok && (r.titles || []).length ? '✅ Tilføjet til ' + r.titles.map((t) => '«' + t + '»').join(', ') : '⚠️ Kunne ikke tilføje';
    setTimeout(() => { b.textContent = '📎 Tilføj til sag'; }, 3200);
  });

  new MutationObserver(() => addButton()).observe(document.body, { childList: true, subtree: true });
  addButton();
})();
