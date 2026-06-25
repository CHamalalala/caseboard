// gmail.js — indsætter en "📎 Tilføj til sag"-knap i Gmail og skraber den åbne mail.
// Defensive selektorer (Gmail-DOM ændrer sig) + flydende knap som fallback.
(function () {
  'use strict';
  const BTN_ID = 'caseboard-add-btn';

  function openEmailEl() {
    // den åbne mail-tråd
    return document.querySelector('div[role="main"] .h7, div[role="main"] .nH .if, div[role="main"]');
  }

  function scrape() {
    const main = document.querySelector('div[role="main"]') || document;
    const subjectEl = main.querySelector('h2.hP') || document.querySelector('h2[data-thread-perm-id]') || main.querySelector('h2');
    // sidste/åbne besked
    const msg = [...main.querySelectorAll('.adn, .gs')].pop() || main;
    const fromEl = msg.querySelector('.gD, span[email]');
    const toEl = msg.querySelector('.g2, .hb span[email]');
    const dateEl = msg.querySelector('.g3, span.gH .g3, .gK span[title]');
    const bodyEl = msg.querySelector('.a3s, .ii.gt div, .ii.gt');
    const dateRaw = dateEl?.getAttribute('title') || dateEl?.textContent || '';
    return {
      subject: (subjectEl?.textContent || '').trim() || '(uden emne)',
      from: (fromEl?.getAttribute('email') || fromEl?.textContent || '').trim(),
      to: (toEl?.getAttribute('email') || toEl?.textContent || '').trim(),
      dateText: dateRaw.trim(),
      date: toIsoDate(dateRaw),
      bodyText: (bodyEl?.innerText || '').trim().slice(0, 20000),
      bodyHtml: sanitize(bodyEl?.innerHTML || ''),
    };
  }

  function toIsoDate(s) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    const m = (s || '').match(/(\d{1,2})[.\/ ]\s*(\d{1,2}|[a-zæøå]+)[.\/ ]\s*(\d{4})/i);
    if (m) { const dt = new Date(s); if (!isNaN(dt)) return dt.toISOString().slice(0, 10); }
    return new Date().toISOString().slice(0, 10);
  }

  // fjern scripts/handlere fra body-html (sikkerhed)
  function sanitize(html) {
    const t = document.createElement('div'); t.innerHTML = html;
    t.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach((n) => n.remove());
    t.querySelectorAll('*').forEach((n) => { [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }); });
    return t.innerHTML.slice(0, 200000);
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!document.querySelector('h2.hP')) return;   // kun når en mail er åben
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:#14213d;color:#fff;border:0;border-radius:24px;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);font-family:Arial,sans-serif';
    btn.addEventListener('click', () => {
      const email = scrape();
      chrome.runtime.sendMessage({ type: 'add-mail', email }, () => {});
      btn.textContent = '✓ Sendt til CaseBoard';
      setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 1800);
    });
    document.body.appendChild(btn);
  }

  // Gmail er en SPA → hold knappen synlig når en mail er åben
  const obs = new MutationObserver(() => addButton());
  obs.observe(document.body, { childList: true, subtree: true });
  addButton();
})();
