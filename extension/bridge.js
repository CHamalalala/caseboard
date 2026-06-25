// bridge.js — kører på CaseBoard-siden. Henter mails i kø og afleverer dem til app'en
// via window.postMessage MED sidens nonce (læst fra DOM). App'en validerer nonce + origin.
(function () {
  'use strict';

  function pageNonce() { return document.documentElement.dataset.cbNonce; }
  function pageReady() { return document.documentElement.dataset.caseboard === '1' && !!pageNonce(); }

  async function flush() {
    if (!pageReady()) return;
    const { pending = [] } = await chrome.storage.local.get('pending');
    if (!pending.length) return;
    const nonce = pageNonce();
    for (const item of pending) {
      window.postMessage({ type: 'caseboard-mail', nonce, email: item.email }, location.origin);
    }
    await chrome.storage.local.set({ pending: [] });   // kø tømt
  }

  // vent til app'en har sat sin nonce (boot), prøv så
  let tries = 0;
  const t = setInterval(() => { if (pageReady() || tries++ > 40) { clearInterval(t); flush(); } }, 250);

  // og når der kommer nye mails mens fanen er åben
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pending) flush();
  });
})();
