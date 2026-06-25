// outlook.js — "📎 Tilføj til sag"-knap til Outlook-web. ALTID synlig (Outlooks DOM er obfuskeret/ustabil).
// Skrab er DEFENSIVT + robust: emne fra læserude-heading ELLER sidetitlen (en-dash-sikker), bred body-fallback,
// afsender = element m. @, dato via parseSmartDate (datefmt.js, indlæst FØR denne fil). Sender altid noget videre.
(function () {
  'use strict';
  const BTN_ID = 'caseboard-add-btn';
  const txt = (n) => (n && (n.innerText || n.textContent) || '').trim();

  // emne fra sidetitlen: Outlook bruger en-dash ("Emne – Konto – Outlook"). Tag første led der ikke er konto/Outlook.
  function subjectFromTitle() {
    const parts = (document.title || '').split(/\s[–—-]\s/).map((s) => s.trim()).filter(Boolean);
    const first = parts[0] || '';
    if (!first || /^(outlook|mail|post|indbakke|inbox|microsoft outlook)$/i.test(first)) return '';
    return first;
  }

  // brødtekst: kendte selektorer først, ellers største fornuftige tekst-blok i læseruden (aldrig tom hvis mail er åben).
  function bodyEl(root) {
    const known = root.querySelector('[aria-label="Meddelelsestekst"],[aria-label="Message body"],[aria-label*="meddelelse" i],[aria-label*="message body" i],[role="document"],.allowTextSelection,.PlainText');
    if (known && (known.innerText || '').trim().length > 40) return known;
    let best = null, bestLen = 0;
    for (const el of root.querySelectorAll('div,section,article')) {
      const len = (el.innerText || '').length;
      if (len > bestLen && len < 200000 && el.children.length < 500) { best = el; bestLen = len; }
    }
    return best || root;
  }

  function scrape() {
    const root = document.querySelector('[role="main"]') || document.body;
    const heading = root.querySelector('[role="heading"][aria-level="2"], [role="heading"]');
    const subject = txt(heading) || subjectFromTitle() || '(uden emne)';
    // afsender: første element der ligner en mailadresse
    const fromEl = [...root.querySelectorAll('span[title], span[aria-label], a[href^="mailto:"]')]
      .find((s) => /@[\w.-]+\.\w+/.test(s.getAttribute('title') || s.getAttribute('aria-label') || s.textContent || s.getAttribute('href') || ''));
    const fromRaw = fromEl ? (fromEl.getAttribute('title') || fromEl.getAttribute('aria-label') || txt(fromEl) || (fromEl.getAttribute('href') || '').replace('mailto:', '')) : '';
    // dato: maskinlæsbare kilder først → parseSmartDate (forstår danske/relative formater), ellers i dag
    const cand = [];
    for (const s of root.querySelectorAll('[datetime], time, span[title]')) cand.push(s.getAttribute('datetime'), s.getAttribute('title'), txt(s));
    const dt = (window.__cbDate || {}).pickDate ? window.__cbDate.pickDate(cand.filter(Boolean)) : { date: new Date().toISOString().slice(0, 10), time: '' };
    const body = bodyEl(root);
    return {
      subject,
      from: fromRaw.trim(),
      to: '',
      dateText: cand.find(Boolean) || '',
      date: dt.date,
      time: dt.time,
      bodyText: txt(body).slice(0, 20000),
      bodyHtml: sanitize(body ? body.innerHTML : ''),
    };
  }

  function sanitize(html) {
    const t = document.createElement('div'); t.innerHTML = html || '';
    t.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach((n) => n.remove());
    t.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return t.innerHTML.slice(0, 200000);
  }

  function toast(msg) {
    let el = document.getElementById('cb-toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'cb-toast';
      el.style.cssText = 'position:fixed;bottom:84px;right:24px;z-index:2147483647;background:#14213d;color:#fff;padding:14px 18px;border-radius:12px;max-width:330px;font:600 14px/1.4 Segoe UI,Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = '0'; }, 4800);
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!document.getElementById('cb-style')) {
      const st = document.createElement('style'); st.id = 'cb-style';
      st.textContent = '@keyframes cbpulse{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.4)}50%{box-shadow:0 8px 32px rgba(26,127,55,.75)}}';
      document.head.appendChild(st);
    }
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#1a7f37;color:#fff;border:0;border-radius:24px;padding:14px 22px;font:800 15px Segoe UI,Arial,sans-serif;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.4);animation:cbpulse 2.4s ease-in-out infinite';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'add-mail', email: scrape() }, () => {});
      toast('✅ Sendt til CaseBoard!  Skift til CaseBoard-fanen og vælg hvilken sag mailen hører til.');
      btn.textContent = '✓ Sendt!';
      setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 2600);
    });
    document.body.appendChild(btn);
  }

  new MutationObserver(() => addButton()).observe(document.documentElement, { childList: true, subtree: true });
  addButton();
})();
