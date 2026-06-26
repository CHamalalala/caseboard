// sw.js — service worker. Cacher app-skallen så den virker offline.
// VIGTIGT: cacher KUN app-koden. Sagsdata ligger i IndexedDB og rører aldrig nettet.
// Strategi: NETWORK-FIRST (hent nyeste online, opdatér cache; fald tilbage til cache offline)
// — så en ny version altid slår igennem, men appen stadig virker uden net.
const CACHE = 'caseboard-v43';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/app.js', './src/ui.js', './src/db.js', './src/model.js', './src/log.js', './src/errors.js',
  './src/search.js', './src/export.js', './src/connectors.js', './src/extract.js', './src/summarize.js', './src/eml.js', './src/datefmt.js', './src/crypto.js',
  './vendor/minisearch.min.js', './vendor/fflate.min.js', './vendor/pdf.min.js', './vendor/pdf.worker.min.js',
  './icons/icon.svg',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // cache:'no-cache' → revalidér altid mod serveren, så ny kode ALTID slår igennem (ikke stale HTTP-cache)
    fetch(e.request, { cache: 'no-cache' })
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
