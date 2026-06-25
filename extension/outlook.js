// outlook.js — "📎 Tilføj til sag"-knap til Outlook-web. ALTID synlig (Outlooks DOM er obfuskeret/ustabil),
// så vi gætter ikke på en "mail er åben"-selektor. Skrab er defensivt — justér selektorer efter behov.
(function () {
  'use strict';
  const BTN_ID = 'caseboard-add-btn';

  const txt = (n) => (n && (n.innerText || n.textContent) || '').trim();

  function scrape() {
    const root = document.querySelector('[role="main"]') || document.body;
    // emne: heading i læseruden, ellers sidetitlen ("Emne - mail - Outlook")
    const heading = root.querySelector('[role="heading"][aria-level="2"], [role="heading"]');
    let subject = txt(heading);
    if (!subject) subject = (document.title || '').split(' - ')[0].trim();
    // afsender: første element der ligner en mailadresse
    const fromEl = [...root.querySelectorAll('span[title], span[aria-label], a[href^="mailto:"]')]
      .find((s) => /@[\w.-]+\.\w+/.test(s.getAttribute('title') || s.getAttribute('aria-label') || s.textContent || s.getAttribute('href') || ''));
    const fromRaw = fromEl ? (fromEl.getAttribute('title') || fromEl.getAttribute('aria-label') || txt(fromEl) || (fromEl.getAttribute('href') || '').replace('mailto:', '')) : '';
    // dato: element hvis title/tekst kan parses som dato
    const dateEl = [...root.querySelectorAll('span[title], time, [datetime]')]
      .find((s) => !isNaN(new Date(s.getAttribute('datetime') || s.getAttribute('title') || s.textContent)));
    const dateRaw = dateEl ? (dateEl.getAttribute('datetime') || dateEl.getAttribute('title') || txt(dateEl)) : '';
    const d = new Date(dateRaw); const ok = !isNaN(d);
    const pad = (x) => String(x).padStart(2, '0');
    // brødtekst
    const bodyEl = root.querySelector('[aria-label="Meddelelsestekst"],[aria-label="Message body"],[role="document"],.allowTextSelection,.PlainText');
    return {
      subject: subject || '(uden emne)',
      from: fromRaw.trim(),
      to: '',
      dateText: dateRaw,
      date: ok ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : new Date().toISOString().slice(0, 10),
      time: ok ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
      bodyText: txt(bodyEl).slice(0, 20000),
      bodyHtml: sanitize(bodyEl ? bodyEl.innerHTML : ''),
    };
  }
  function sanitize(html) {
    const t = document.createElement('div'); t.innerHTML = html || '';
    t.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach((n) => n.remove());
    t.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return t.innerHTML.slice(0, 200000);
  }
  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'position:fixed;top:96px;right:26px;z-index:2147483647;background:#14213d;color:#fff;border:0;border-radius:20px;padding:10px 18px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);font-family:Arial,sans-serif';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'add-mail', email: scrape() }, () => {});
      btn.textContent = '✓ Sendt — vælg sag i CaseBoard';
      setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 2200);
    });
    document.body.appendChild(btn);
  }
  new MutationObserver(() => addButton()).observe(document.documentElement, { childList: true, subtree: true });
  addButton();
})();
