// bridge.js — kører på CaseBoard-siden. (1) henter sags-listen via PRIVAT postMessage (ikke en persistent DOM-attribut),
// (2) afleverer mails i kø til app'en MED sidens nonce, men FJERNER dem først NÅR app'en kvitterer (durabel kø — ingen tabt
// mail hvis fanen lukker), (3) gemmer kvitteringen så mail-fanen kan vise "✅ Tilføjet" uden fane-skift.
(function () {
  'use strict';
  const pageNonce = () => document.documentElement.dataset.cbNonce;
  const pageReady = () => document.documentElement.dataset.caseboard === '1' && !!pageNonce();
  const inflight = new Set();   // q_-nøgler vi har sendt, afventer ack (undgå dobbelt-post i samme session)

  async function flush() {
    if (!pageReady()) return;
    const all = await chrome.storage.local.get(null);
    const nonce = pageNonce();
    for (const k in all) {
      if (k.slice(0, 2) !== 'q_' || inflight.has(k)) continue;
      const item = all[k];
      if (!item || !item.email) { chrome.storage.local.remove(k); continue; }
      inflight.add(k);
      window.postMessage({ type: 'caseboard-mail', nonce, qid: item.id, email: item.email, targets: item.targets, opts: item.opts }, location.origin);
    }
  }

  function requestCases() { window.postMessage({ type: 'caseboard-getcases', nonce: pageNonce() }, location.origin); }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.nonce !== pageNonce()) return;
    if (d.type === 'caseboard-cases' && Array.isArray(d.list)) {
      // valider skema før lagring (defensivt mod sjusk/injektion) — kun id+titel+antal
      const clean = d.list.filter((c) => c && typeof c.id === 'string' && typeof c.title === 'string').map((c) => ({ id: c.id, title: c.title, n: +c.n || 0 }));
      chrome.storage.local.set({ caseList: clean });
    } else if (d.type === 'caseboard-ack') {
      if (d.qid) { inflight.delete('q_' + d.qid); chrome.storage.local.remove('q_' + d.qid); }   // FJERN først ved kvittering
      chrome.storage.local.set({ lastResult: { ok: !!d.ok, titles: Array.isArray(d.titles) ? d.titles : [], at: Date.now() } });
    }
  });

  // vent til app'en er klar → bed om sags-listen (privat) + tøm kø
  let tries = 0;
  const t = setInterval(() => { if (pageReady() || tries++ > 60) { clearInterval(t); requestCases(); flush(); } }, 250);
  // nye mails i køen mens fanen er åben
  chrome.storage.onChanged.addListener((ch, area) => { if (area !== 'local') return; for (const k in ch) if (k.slice(0, 2) === 'q_') { flush(); break; } });
})();
