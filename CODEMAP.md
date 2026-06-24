# CODEMAP — CaseBoard (hvor bor X)

En lille, modulær PWA. Ingen build-step (ren HTML/CSS/JS), så den deployer direkte til GitHub Pages.

| Fil | Ansvar |
|-----|--------|
| `index.html` | App-skal + registrerer service worker. |
| `styles.css` | Al styling (CSS-variabler øverst). |
| `src/app.js` | **Controller**: state, render, alle handlinger (Indsæt, åbn fil, drag→opsummering, eksport/import, seed). Binder alt sammen. |
| `src/ui.js` | Rene DOM-hjælpere: `el()` element-builder, `insertModal()` (datovælger+felter+fil), `toast()`. Ingen sags-logik. |
| `src/model.js` | **Hjernen**: skema (`newEvent`, `newSummary`, `newCase`) + ren logik (`sortEvents`, `insertIndex`, `daDate`). Testet. |
| `src/db.js` | IndexedDB-wrapper: `saveCase/loadCase`, `putFile/getFile/allFiles`, `clearAll`. Data lokalt. |
| `src/log.js` | ÉN log-kanal (område-tagget). |
| `src/errors.js` | TYPEDE fejl (`AppError` m. stabil kode). |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: installbar + offline. |
| `tests/core.test.mjs` | Tests på kerne-logikken (`node tests/core.test.mjs`). |

**Eksempel/demo:** `loadDemo()` i `app.js` bygger en **fiktiv** demo inline (ingen rigtige data → sikkert at hoste).
Den **rigtige Uglebakken-sag** ligger som en lokal import-fil i sagsmappen
(`Norden-Advokat-Sag-516889/Uglebakken-516889.caseboard.json`) og committes ALDRIG (se `.gitignore`).

## Dataflow (kort)
`boot()` → `db.openDB()` → `db.loadCase()` → `render()`.
Enhver ændring → muterer `state.case` → `db.saveCase()` (auto-gem) → `render()`.
Filer gemmes som Blobs i `files`-store; vises via `URL.createObjectURL`.
**Sagsdata forlader aldrig maskinen** — kun app-koden hostes på Pages.

## Tommelfinger
"Kan en fremtidig udvikler finde + rette en fejl her på 2 min?" — log-kanal + typede fejl + denne side skal sikre ja.
