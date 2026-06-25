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
    const d = new Date(dateRaw);
    const ok = !isNaN(d);
    return {
      subject: (subjectEl?.childNodes[0]?.textContent || subjectEl?.textContent || '').trim() || '(uden emne)',
      from: (fromEl?.getAttribute('email') || fromEl?.textContent || '').trim(),
      to: (toEl?.getAttribute('email') || toEl?.textContent || '').trim(),
      dateText: dateRaw.trim(),
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
    const subj = document.querySelector('h2.hP');
    if (!subj || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '📎 Tilføj til sag';
    btn.style.cssText = 'margin-left:12px;vertical-align:middle;background:#14213d;color:#fff;border:0;border-radius:16px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap';
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      chrome.runtime.sendMessage({ type: 'add-mail', email: scrape() }, () => {});
      btn.textContent = '✓ Sendt til CaseBoard';
      setTimeout(() => { btn.textContent = '📎 Tilføj til sag'; }, 1800);
    });
    subj.appendChild(btn);   // ØVERST — lige efter emnet
  }

  new MutationObserver(() => addButton()).observe(document.body, { childList: true, subtree: true });
  addButton();
})();
