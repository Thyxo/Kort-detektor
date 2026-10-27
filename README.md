# Card Detector

**Live:** https://card-detector-beta.vercel.app

Magi-app (PWA) der ligner en detektor, man holder hen over et spillekort. Den registrerer intet – buerne tænder, når du trykker på en usynlig hemmelig knap.

## Sådan bruges den
1. **Tryk på den runde knap** (nederst i midten) → knappen bliver rød = detektoren er "tændt". Buerne er grå.
2. Før telefonen hen over kortene. Ved det rigtige kort: **tryk diskret med tommelfingeren lige til højre for knappen** (usynlig knap).
3. Buerne tænder nedefra og op (rød → orange → gul → grøn) med stigende bip og en "fundet"-tone til sidst.
4. **Tryk på den runde knap** for at nulstille.

Den hemmelige knap virker kun, når detektoren er tændt (rød).

## Hemmelig menu
**5 hurtige tryk i øverste højre hjørne.** Luk med *Færdig*, tryk udenfor eller træk arket ned.

- **Lyd**: til/fra, lydstyrke, spil selv på lydløs, prøvelyd
- **Hemmelig knap**: til/fra, placering (venstre / over / højre), størrelse, *vis knappen* (til øvelse), vibration ved tryk
- **Opstigning**: hastighed (hurtig 0,8 s / medium 1,2 s / langsom 2 s), hvad tryk efter fund gør (sluk / klar igen), *Vis demo*
- **Nulstil indstillinger** (tryk to gange)

Alt gemmes på telefonen (localStorage). Nederst i menuen står en lille diagnose-linje (skærm, vindue, app-højde) – send et skærmbillede af den, hvis layoutet ser forkert ud.

Åbningsmetoden ændres øverst i `app.js` (`MENU_OPEN`): antal tryk, langt tryk i stedet, hjørne og størrelse. Buernes form ændres i `ARC_LAYOUT`.

## 1. Opret GitHub-repo
1. github.com → **New repository** → navn fx `Kort-detektor` → **Create**.
2. Upload alle filer (eller `git push`).

## 2. Forbind til Vercel
1. vercel.com → **Add New… → Project** → vælg repoet → **Import**.
2. Framework: **Other**. Ingen build-kommando. Tryk **Deploy**.
3. Hver gang du pusher til `main`, opdateres appen automatisk.

## 3. Læg appen på hjemmeskærmen (iPhone)
1. Åbn linket i **Safari**.
2. Tryk **Del** (firkant med pil) → **Føj til hjemmeskærm** → **Tilføj**.
3. Åbn appen fra ikonet – så kører den i fuld skærm uden Safari-bjælker og virker offline.

> Ny version? Luk appen helt og åbn den igen (med net). Hæv `VERSION` i `sw.js` ved ændringer.

## Filer
```
index.html      Skærm og hemmelig menu
style.css       Udseende
app.js          Tilstande, buer, lyd (Web Audio), menu, skærmlås
sw.js           Offline-cache
manifest.json   PWA-oplysninger
icons/          Ikoner
tools/make-icons.mjs   Laver ikoner (node tools/make-icons.mjs)
tests/e2e.mjs          Automatisk test (node tests/e2e.mjs)
```
