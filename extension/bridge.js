// bridge.js — kører på CaseBoard-siden. (1) synker sags-listen til chrome.storage (til mail-popup'en),
// (2) afleverer mails i kø til app'en via postMessage MED sidens nonce (app'en validerer nonce + origin),
// (3) modtager app'ens kvittering og gemmer den, så mail-fanen kan vise "✅ Tilføjet" uden fane-skift.
(function () {
  'use strict';

  function pageNonce() { return document.documentElement.dataset.cbNonce; }
  function pageReady() { return document.documentElement.dataset.caseboard === '1' && !!pageNonce(); }

  // synk LET sags-liste (id+titel+antal) fra <html data-cb-cases> → chrome.storage.local.caseList
  function syncCases() {
    try { const raw = document.documentElement.dataset.cbCases; if (raw) chrome.storage.local.set({ caseList: JSON.parse(raw) }); }
    catch (e) { /* ignore */ }
  }

  async function flush() {
    if (!pageReady()) return;
    const { pending = [] } = await chrome.storage.local.get('pending');
    if (!pending.length) return;
    const nonce = pageNonce();
    for (const item of pending) {
      window.postMessage({ type: 'caseboard-mail', nonce, email: item.email, targets: item.targets }, location.origin);
    }
    await chrome.storage.local.set({ pending: [] });   // kø tømt
  }

  // app'en kvitterer (caseboard-ack, samme-origin + nonce) → gem resultatet til mail-fanens bekræftelse
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'caseboard-ack' || d.nonce !== pageNonce()) return;
    chrome.storage.local.set({ lastResult: { ok: !!d.ok, titles: Array.isArray(d.titles) ? d.titles : [], at: Date.now() } });
  });

  // vent til app'en har sat sin nonce (boot) → synk sager + tøm kø
  let tries = 0;
  const t = setInterval(() => { if (pageReady() || tries++ > 40) { clearInterval(t); syncCases(); flush(); } }, 250);
  // hold sags-listen synket når sager ændres mens fanen er åben
  new MutationObserver(syncCases).observe(document.documentElement, { attributes: true, attributeFilter: ['data-cb-cases'] });
  // og når der kommer nye mails i køen mens fanen er åben
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.pending) flush(); });
})();
