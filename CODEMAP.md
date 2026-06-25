# CODEMAP — CaseBoard (hvor bor X)

En lille, modulær PWA. Ingen build-step (ren HTML/CSS/JS), så den deployer direkte til GitHub Pages.

| Fil | Ansvar |
|-----|--------|
| `index.html` | App-skal + registrerer service worker. |
| `styles.css` | Al styling (CSS-variabler øverst). |
| `src/app.js` | **Controller**: state (åbne sager + faner), render-router, alle handlinger. Binder alt sammen. Sektioner: `renderOverblik/Tidslinje/Dokumenter/Personer/Frister/Soeg`. |
| `src/ui.js` | Rene DOM-hjælpere: `el()`, `insertModal()` (datovælger+felter+fil), `toast()`. Ingen sags-logik. |
| `src/model.js` | **Hjernen**: skema (`newEvent/newSummary/newCase/newPerson/newDeadline`) + ren logik (`sortEvents`, `deadlineStatus`, `fileKind`, `daDate`). Testet. |
| `src/db.js` | IndexedDB (v2): `cases`-store (multi-sag) + `files` (Blobs **+ udtrukket tekst**) + `app`-state. Migrerer v1. |
| `src/search.js` | Søgning: MiniSearch + substring-fallback (danske sammensatte ord); scope-filtre; snippet/highlight. |
| `src/extract.js` | Dokument-tekst: pdf.js (PDF) + fflate (.docx) + tekstfiler → søgbar tekst. Offline. |
| `src/export.js` | Pakke-eksport (zip via fflate): Bilag/ + `Sagsoversigt.html` + gen-import-json + LÆS-MIG. `overviewHtml` genbruges til Print. |
| `src/connectors.js` | SVG-tråde fra opsummeringer (frit lærred) → begivenheder; hver sin farve. Synkron tegning (rAF throttles i baggrund). |
| `src/summarize.js` | EKSTRAKTIV opsummering (nul hallucination) — nøglepunkter m. boilerplate-filter + længde-modes (kort/normal/lang). |
| `src/eml.js` | Universal .eml-import (RFC822: encoded-words, QP/base64, multipart, modtage-tid); HTML renses (XSS). |
| `src/model.js` (jura) | `claims`/`elements` (argumentkort), `claimStrength` (bevisbyrde + kumulativt killswitch + korroboration), `citations`, `DK_FRISTER`+`computeDeadline`. |
| `extension/` | MV3 browser-udvidelse: "📎 Tilføj til sag" i Gmail → CaseBoard (nonce+origin-valideret `message`-modtager i app.js). |
| `src/log.js` | ÉN log-kanal. | `src/errors.js` | TYPEDE fejl. |
| `vendor/` | Lokale (offline) libs: `minisearch`, `fflate`, `pdf.min.js` + `pdf.worker.min.js`. Ingen CDN. |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: installbar + offline. SW = network-first; bump `CACHE` ved hver deploy. |
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
