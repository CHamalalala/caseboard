# ⚖️ CaseBoard

Et **privat, universelt værktøj til at føre en sag**: en tidslinje der bygger sig selv ud fra daterede
beviser, dokumenter du kan åbne, og dine egne opsummeringer hvor du kan **trække begivenheder ind**.

- **"Indsæt"** → vælg dato + vedhæft fil → beviset lægger sig på sin plads i tidslinjen.
- **Mine opsummeringer** → opret kort og **træk begivenheder ind** for at samle din argumentation.
- **Eksportér / Importér** en hel sag som én `.json`-fil (flyt mellem maskiner, tag backup).
- **Installér som app** (Edge/Chrome → "Installér som app") → eget vindue, virker **offline**, intet `.exe`, intet antivirus-flag.

## 🔒 Fortrolighed
**Dine sagsdata gemmes KUN lokalt i din browser (IndexedDB) og sendes aldrig til nettet.**
Kun selve app-koden ligger på GitHub Pages. Eksport-filen er lokal.

## Kør lokalt
```
python -m http.server 8077      # åbn http://localhost:8077
npm test                         # kør kerne-tests
```

## Status
MVP. Næste faser: rich-text i opsummeringer, etiketter/farver, multi-sag-dashboard, password-krypteret eksport.
Se `CODEMAP.md` for hvor tingene bor.
