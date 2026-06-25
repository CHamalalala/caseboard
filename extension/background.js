// background.js — modtager mail fra Gmail-knappen, lægger den i kø, og åbner/fokuserer CaseBoard.
const CASEBOARD_URL = 'https://chamalalala.github.io/caseboard/';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'add-mail') return;
  (async () => {
    // læg mail i kø (bridge.js tømmer den, når CaseBoard er klar)
    const { pending = [] } = await chrome.storage.local.get('pending');
    pending.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), email: msg.email });
    await chrome.storage.local.set({ pending });

    // find en åben CaseBoard-fane, ellers åbn en
    const tabs = await chrome.tabs.query({ url: 'https://chamalalala.github.io/caseboard/*' });
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: CASEBOARD_URL, active: true });
    }
    sendResponse?.({ ok: true });
  })();
  return true;  // async svar
});
