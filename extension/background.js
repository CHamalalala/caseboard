// background.js — modtager mail fra mail-knappen, lægger den (m. valgte sager) i en DURABEL kø, og sikrer en CaseBoard-fane.
// Hver mail får sin EGEN storage-nøgle (q_<id>) → ingen read-modify-write-race på en delt liste (GLM P0).
const CASEBOARD_URL = 'https://chamalalala.github.io/caseboard/';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'add-mail') return;
  (async () => {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2);
    await chrome.storage.local.set({ ['q_' + id]: { id, email: msg.email, targets: msg.targets || null, opts: msg.opts || null, at: Date.now() } });

    // sikr en CaseBoard-fane så mailen kan skrives. Med targets (valgt i popup'en) STJÆLER vi IKKE fokus — åbn i baggrunden.
    const tabs = await chrome.tabs.query({ url: 'https://chamalalala.github.io/caseboard/*' });
    if (tabs.length) {
      if (!msg.targets) { await chrome.tabs.update(tabs[0].id, { active: true }); if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true }); }
      // findes allerede + targets → bridge fanger køen via storage.onChanged; ingen fokus-ændring
    } else {
      await chrome.tabs.create({ url: CASEBOARD_URL, active: !msg.targets });   // baggrund hvis targets, ellers forgrund (modal-fallback)
    }
    sendResponse?.({ ok: true });
  })();
  return true;  // async svar
});
