# CaseBoard — "Tilføj til sag" (browser-udvidelse)

En lille Chrome/Edge-udvidelse der lægger en **📎 Tilføj til sag**-knap i Gmail. Klik den, så lander
mailen automatisk i den åbne sag i CaseBoard som en **begivenhed + dokument** (med korrekt dato,
afsender og emne) — uden screenshots.

## Sådan installerer du den (unpacked — ingen Web Store nødvendig)
1. Åbn **Chrome** → `chrome://extensions` (eller Edge → `edge://extensions`).
2. Slå **Udviklertilstand** til (øverst til højre).
3. Klik **"Indlæs upakket"** → vælg denne mappe (`extension/`).
4. Åbn **CaseBoard** i en fane: https://chamalalala.github.io/caseboard/ (åbn den sag du vil tilføje til).
5. Gå til **Gmail**, åbn en mail → tryk den flydende **📎 Tilføj til sag**-knap nederst til højre.
   → Mailen dukker op i CaseBoards tidslinje. ✅

## Sådan virker det (og hvorfor det er sikkert)
- `gmail.js` skraber den åbne mail (emne/afsender/dato/tekst), renser body for scripts.
- `background.js` lægger mailen i en kø og åbner/fokuserer din CaseBoard-fane.
- `bridge.js` afleverer mailen til CaseBoard-siden via `postMessage` **med sidens hemmelige nonce**.
- CaseBoard accepterer **kun** beskeder med korrekt **nonce + samme origin** → en ondsindet side kan
  ikke indsætte falske begivenheder. **Mailen sendes aldrig til en server** — kun til din lokale CaseBoard.

## Kendte begrænsninger
- **Gmail først** (Outlook-web kan tilføjes senere — DOM'en er anderledes).
- Gmail ændrer af og til sin HTML; hvis knappen holder op med at skrabe korrekt, skal selektorerne i
  `gmail.js` (`h2.hP`, `.gD`, `.a3s`, …) opdateres. Knappen er bevidst defensiv.
- Datoen udledes af mailens dato-felt; tjek den efter behov.
