// background.js — modtager mail fra mail-knappen, lægger den (m. valgte sager) i kø, og sikrer en CaseBoard-fane.
const CASEBOARD_URL = 'https://chamalalala.github.io/caseboard/';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'add-mail') return;
  (async () => {
    // læg mail + valgte sager i kø (bridge.js tømmer den, når CaseBoard er klar)
    const { pending = [] } = await chrome.storage.local.get('pending');
    pending.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), email: msg.email, targets: msg.targets || null });
    await chrome.storage.local.set({ pending });

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
