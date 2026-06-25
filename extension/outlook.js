// outlook.js — "📎 Tilføj til sag"-knap til Outlook-web (outlook.live.com / outlook.office.com).
// Outlooks DOM er obfuskeret og skifter ofte → defensiv: knap øverst + bedst-muligt skrab. Justér selektorer ved behov.
(function () {
  'use strict';
  const BTN_ID = 'caseboard-add-btn';

  function scrape() {
    const read = document.querySelector('[role="main"]') || document;
    const subjectEl = read.querySelector('[role="heading"][aria-level="2"], [role="heading"]') || read.querySelector('span[title]');
    // afsender: et element med en mail-adresse
    const fromEl = [...read.querySelectorAll('span[title*="@"], span[aria-label*="@"]')][0];
    const dateEl = [...read.querySelectorAll('span[title]')].find((s) => !isNaN(new Date(s.getAttribute('title'))));
    const bodyEl = read.querySelector('[aria-label="Meddelelsestekst"], [aria-label="Message body"], .allowTextSelection, [role="document"]');
    const dateRaw = dateEl?.getAttribute('title') || '';
    const d = new Date(dateRaw); const ok = !isNaN(d);
    const fromTxt = (fromEl?.getAttribute('title') || fromEl?.textContent || '').trim();
    return {
      subject: (subjectEl?.textContent || document.title || '').trim() || '(uden emne)',
      from: fromTxt,
      to: '',
      dateText: dateRaw,
      date: ok ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      time: ok ? d.toTimeString().slice(0, 5) : '',
      bodyText: (bodyEl?.innerText || '').trim().slice(0, 20000),
      bodyHtml: sanitize(bodyEl?.innerHTML || ''),
    };
  }
  function sanitize(html) {
    const t = document.createElement('div'); t.innerHTML = html;
    t.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach((n) => n.remove());
    t.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return t.innerHTML.slice(0, 200000);
  }
  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const heading = document.querySelector('[role="main"] [role="heading"]');
    if (!heading) return;     // kun når en mail er åben
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'position:fixed;top:64px;right:28px;z-index:99999;background:#14213d;color:#fff;border:0;border-radius:18px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.3);font-family:Arial,sans-serif';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'add-mail', email: scrape() }, () => {});
      btn.textContent = '✓ Sendt'; setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 1800);
    });
    document.body.appendChild(btn);
  }
  new MutationObserver(() => addButton()).observe(document.body, { childList: true, subtree: true });
  addButton();
})();
