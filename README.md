# WebP-converter

Zet foto's in bulk om naar WebP, met zo min mogelijk kwaliteitsverlies.
**Alles gebeurt in je eigen browser.** Er wordt niets geüpload en niets opgeslagen.

## Gebruiken

1. Open de website (of `index.html` via een lokale webserver, zie onder).
2. Kies de kwaliteit (90 is een goede standaard) of zet **Lossless** aan voor nul verlies.
3. Kies eventueel een maximale afmeting, bijvoorbeeld 2000 px voor je website.
4. Sleep foto's of een hele map op de pagina, of gebruik de knoppen.
5. Download per foto, of alles tegelijk als `.zip`.

Als je map submappen heeft, blijft die indeling in de zip bewaard.

## Privacy: wat gebeurt er met mijn foto's?

- De foto's worden alleen in het geheugen van je browser verwerkt. Tab dicht, en ze zijn weg.
- De pagina heeft een beveiligingsregel (Content Security Policy, bovenaan `index.html`) met
  `connect-src 'none'`. Daarmee verbiedt de **browser zelf** dat de code iets naar internet stuurt.
  Dat geldt ook voor de achtergrond-werker die de foto's omzet.
- Camera-gegevens (EXIF, zoals GPS-locatie, cameramodel en datum) worden niet meegenomen in de WebP.
  De foto wordt wel eerst rechtop gedraaid volgens die gegevens.
- Geen tracking, geen cookies, geen analytics.

### Zelf controleren: de wifi-test

1. Open de pagina en wacht tot er staat: *"Klaar voor gebruik…"*.
2. Zet je wifi/internet uit.
3. Zet een paar foto's om en download ze.

Werkt het? Dan kan er niets geüpload zijn: zonder internet kan dat niet.

### Zelf controleren: meekijken met F12

Druk op F12 (Mac: Cmd+Option+I), kies het tabblad **Netwerk** en zet foto's om.
Bij het laden zie je de bestanden van de site zelf. Tijdens het omzetten zie je alleen regels die met `blob:` beginnen. Dat zijn lokale bestandjes in je eigen browser
(voorbeeldplaatjes en downloads), geen verbindingen met internet.

## Op internet zetten met GitHub Pages (gratis)

1. Ga op GitHub naar deze repository › **Settings** › **Pages**.
2. Kies bij *Source*: **Deploy from a branch**, kies de branch en map `/ (root)`, en klik **Save**.
3. Na een minuut staat de site op `https://<jouw-gebruikersnaam>.github.io/webp/`.

## Lokaal draaien

Dubbelklikken op `index.html` werkt niet (browsers laden dan geen modules). Start in deze map een
mini-webserver:

```bash
python3 -m http.server 8000
```

en open daarna http://localhost:8000.

## Hoe het werkt

| Bestand | Wat het doet |
|---|---|
| `index.html` | De pagina, met het beveiligingsslot (CSP) |
| `app.js` | Foto's verzamelen, verdelen over werkers, resultaten tonen, zip maken |
| `worker.js` | Per foto: inlezen, eventueel verkleinen, omzetten naar WebP |
| `zip.js` | Maakt het zip-bestand, zonder externe bibliotheek |
| `vendor/webp/` | De WebP-encoder: Google's libwebp als WebAssembly, uit [jSquash](https://github.com/jamsinclair/jSquash) `@jsquash/webp` 1.5.0 |
| `tools/embed-wasm.mjs` | Zet de `.wasm`-bestanden om naar `*_wasm.js`, zodat ze zonder netwerkverzoek laden |

Er wordt geen code van andere websites geladen: alles staat in deze repository.

## Licenties

- Eigen code in deze repository: van jou.
- libwebp: BSD-licentie, zie `vendor/webp/LICENSE-libwebp.txt` en `PATENTS-libwebp.txt`.
- jSquash / Squoosh-codec: Apache-2.0, zie `vendor/webp/LICENSE-jsquash-Apache-2.0.txt`.

## Beperkingen

- HEIC-foto's (standaard op iPhone) kunnen alleen in Safari worden gelezen. Zet op je iPhone
  *Instellingen › Camera › Formaten* op **Meest compatibel**, of exporteer eerst als JPG.
- Werkt in recente versies van Chrome, Edge, Firefox en Safari (16.4 of nieuwer).
- Bij lossless kan een WebP soms groter worden dan een JPG. De lijst laat dat dan zien.
