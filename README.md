<p align="center">
  <img src="extension-chrome/icons/icon128.png" alt="ParcelPulse Logo" width="120">
</p>

<h1 align="center">ParcelPulse</h1>
<h3 align="center"><em>Il battito del tuo pacco ~ The heartbeat of your parcel</em></h3>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blueviolet?style=for-the-badge&logo=googlechrome&logoColor=white" alt="MV3">
  <img src="https://img.shields.io/badge/Chrome-88%2B-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome 88+">
  <img src="https://img.shields.io/badge/Firefox-128%2B-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Firefox 128+">
  <img src="https://img.shields.io/badge/Licenza-Libera-blue?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="Licenza Libera">
  <img src="https://img.shields.io/badge/OSINT-Legale-success?style=for-the-badge&logo=shield&logoColor=white" alt="OSINT">
  <img src="https://img.shields.io/badge/Hacking%3F-Assolutamente%20NO-red?style=for-the-badge&logo=hackthebox&logoColor=white" alt="No Hacking">
  <img src="https://img.shields.io/badge/Privacy-100%25%20Locale-teal?style=for-the-badge&logo=tor&logoColor=white" alt="Privacy">
  <img src="https://img.shields.io/badge/%F0%9F%8D%96-Arrosticini%20Powered-orange?style=for-the-badge" alt="Arrosticini">
</p>

---

# IT - Italiano

## Che cos'e' ParcelPulse?

ParcelPulse e' un'estensione browser (Chrome + Firefox) che ti permette di **tracciare in tempo reale la posizione del corriere Amazon** su una mappa GPS interattiva, direttamente dal tuo browser.

Apri Amazon, vai sulla pagina del tuo ordine in consegna, e ParcelPulse ti mostra:

- La **posizione live del corriere** su mappa OpenStreetMap
- La **distanza stradale reale** (calcolata con OSRM, non in linea d'aria!)
- Le **fermate rimanenti** prima della tua consegna
- **Notifiche smart** quando il corriere e' vicino o cambia stato

Il tutto **senza registrazione**, **senza server di terze parti**, **senza raccolta dati**. Tutto gira nel tuo browser. Punto.

## Ma e' legale? E' hacking?

**No, non e' hacking. Per niente. Zero. Nada.**

ParcelPulse utilizza esclusivamente **tecniche OSINT** (Open Source Intelligence), ovvero accede a dati che Amazon **gia' ti mostra** nella tua sessione autenticata. Se vai sulla pagina di tracking del tuo ordine, Amazon ti dice dove si trova il corriere. Noi prendiamo quell'informazione e la mettiamo su una mappa carina. Fine.

Nello specifico:

- **Nessun reverse engineering** di API private o protocolli proprietari
- **Nessun bypass** di autenticazione, captcha o rate limiting
- **Nessuna intercettazione** di traffico di rete
- **Nessun scraping massivo** o automatizzato
- L'estensione legge i dati **dalla tua sessione gia' autenticata nel browser** (gli stessi identici cookie che usi tu quando navighi su Amazon)
- Il CSRF token viene estratto dalla pagina Amazon che **hai gia' aperto tu** nel browser
- I dati di tracking sono quelli che Amazon espone **a te**, come utente loggato, tramite le sue API interne del frontend

E' l'equivalente digitale di guardare la mappa di tracking che Amazon ti mostra, ma messa su OpenStreetMap anziche' sulla loro mappa proprietaria. Se questo fosse hacking, anche lo screenshot sarebbe hacking.

## Come funziona (tecnicamente)

```
Tu apri Amazon  -->  content-amazon.js cattura il CSRF token dalla pagina
                     (lo stesso token che Amazon usa nel suo frontend)
                         |
                         v
                background.js usa il token + i cookie della tua sessione
                per chiamare le stesse API che Amazon chiama nel suo frontend
                         |
                         v
                Dati di tracking (coordinate GPS, stato, fermate)
                         |
                         v
                overlay.js li renderizza su una mappa Leaflet/OpenStreetMap
                con routing stradale reale via OSRM (open source)
```

### Struttura file

| File | Cosa fa |
|------|---------|
| `manifest.json` | Configurazione estensione (MV3) |
| `background.js` | Service Worker: gestione sessioni, API calls, routing OSRM, notifiche |
| `content-amazon.js` | Content script: cattura CSRF token, rileva pagine tracking |
| `content-webapp.js` | Content script per il sito parcelpulse.it |
| `pageScript.js` | Iniettato nel contesto MAIN per estrarre il CSRF token dal DOM |
| `overlay.js` | Logica overlay: mappa Leaflet, markers, route, auto-refresh 30s |
| `overlay.html/css` | UI dell'overlay fullscreen con mappa |
| `popup.js/html/css` | Popup dell'estensione: domini connessi, azioni, condivisione |
| `leaflet/` | Libreria Leaflet.js per le mappe (bundled, no CDN) |
| `icons/` | Icone dell'estensione |

### Differenze Chrome vs Firefox

| | Chrome | Firefox |
|---|--------|---------|
| Manifest | `background.service_worker` | `background.scripts` |
| Gecko settings | - | `browser_specific_settings.gecko` con ID e versione minima |
| Namespace JS | `chrome.*` | `chrome.*` (shim compatibilita') |
| Link condivisione | Chrome Web Store | Firefox Add-ons (AMO) |
| **Tutto il resto** | **Identico** | **Identico** |

## 20+ domini Amazon supportati

Italia, USA, UK, Germania, Francia, Spagna, Giappone, India, Australia, Canada, Brasile, Singapore, Paesi Bassi, Polonia, Svezia, Emirati Arabi, Arabia Saudita, Turchia, Belgio, Egitto, Colombia.

## Installazione

### Chrome
1. Scarica da [Chrome Web Store](https://chromewebstore.google.com/detail/parcelpulse/idgmlajpkopmbdglnjbhkljjgoncjfga)
2. Oppure: `chrome://extensions` > Modalita' sviluppatore > Carica estensione non pacchettizzata > seleziona `extension-chrome/`

### Firefox
1. Scarica da [Firefox Add-ons](https://addons.mozilla.org/it/firefox/addon/parcelpulse/)
2. Oppure: `about:debugging#/runtime/this-firefox` > Carica componente aggiuntivo temporaneo > seleziona `extension-firefox/manifest.json`

### Caricamento manuale (sviluppatori)
```bash
git clone https://github.com/LorisCastoran/ParcelPulse.git
cd ParcelPulse/Parcel_Pulse_toGithub
# Chrome: carica extension-chrome/
# Firefox: carica extension-firefox/manifest.json
```

---

# EN - English

## What is ParcelPulse?

ParcelPulse is a browser extension (Chrome + Firefox) that lets you **track your Amazon courier's position in real time** on an interactive GPS map, right from your browser.

Open Amazon, go to your delivery order page, and ParcelPulse shows you:

- The **courier's live position** on an OpenStreetMap map
- The **actual road distance** (calculated with OSRM, not as the crow flies!)
- The **remaining stops** before your delivery
- **Smart notifications** when the courier is nearby or the status changes

All of this **without registration**, **without third-party servers**, **without data collection**. Everything runs in your browser. Period.

## Is it legal? Is it hacking?

**No, it's not hacking. Not at all. Zero. Zilch. Niente.**

ParcelPulse exclusively uses **OSINT techniques** (Open Source Intelligence), meaning it accesses data that Amazon **already shows you** in your authenticated session. If you go to your order's tracking page, Amazon tells you where the courier is. We take that information and put it on a pretty map. That's it.

Specifically:

- **No reverse engineering** of private APIs or proprietary protocols
- **No bypassing** of authentication, captcha, or rate limiting
- **No interception** of network traffic
- **No massive or automated scraping**
- The extension reads data **from your already-authenticated browser session** (the exact same cookies you use when browsing Amazon)
- The CSRF token is extracted from the Amazon page **you already have open** in your browser
- The tracking data is what Amazon exposes **to you**, as a logged-in user, through its internal frontend APIs

It's the digital equivalent of looking at the tracking map Amazon shows you, but rendered on OpenStreetMap instead of their proprietary map. If this were hacking, then taking a screenshot would be hacking too.

## How it works (technically)

```
You open Amazon  -->  content-amazon.js captures the CSRF token from the page
                      (the same token Amazon uses in its frontend)
                          |
                          v
                 background.js uses the token + your session cookies
                 to call the same APIs that Amazon calls in its own frontend
                          |
                          v
                 Tracking data (GPS coordinates, status, stops)
                          |
                          v
                 overlay.js renders them on a Leaflet/OpenStreetMap map
                 with real road routing via OSRM (open source)
```

### File structure

| File | What it does |
|------|-------------|
| `manifest.json` | Extension configuration (MV3) |
| `background.js` | Service Worker: session management, API calls, OSRM routing, notifications |
| `content-amazon.js` | Content script: captures CSRF token, detects tracking pages |
| `content-webapp.js` | Content script for the parcelpulse.it website |
| `pageScript.js` | Injected in MAIN context to extract the CSRF token from the DOM |
| `overlay.js` | Overlay logic: Leaflet map, markers, route, 30s auto-refresh |
| `overlay.html/css` | Fullscreen overlay UI with map |
| `popup.js/html/css` | Extension popup: connected domains, actions, sharing |
| `leaflet/` | Leaflet.js library for maps (bundled, no CDN) |
| `icons/` | Extension icons |

### Chrome vs Firefox differences

| | Chrome | Firefox |
|---|--------|---------|
| Manifest | `background.service_worker` | `background.scripts` |
| Gecko settings | - | `browser_specific_settings.gecko` with ID and min version |
| JS namespace | `chrome.*` | `chrome.*` (compatibility shim) |
| Share link | Chrome Web Store | Firefox Add-ons (AMO) |
| **Everything else** | **Identical** | **Identical** |

## 20+ supported Amazon domains

Italy, USA, UK, Germany, France, Spain, Japan, India, Australia, Canada, Brazil, Singapore, Netherlands, Poland, Sweden, UAE, Saudi Arabia, Turkey, Belgium, Egypt, Colombia.

## Installation

### Chrome
1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/parcelpulse/idgmlajpkopmbdglnjbhkljjgoncjfga)
2. Or: `chrome://extensions` > Developer mode > Load unpacked > select `extension-chrome/`

### Firefox
1. Install from [Firefox Add-ons](https://addons.mozilla.org/it/firefox/addon/parcelpulse/)
2. Or: `about:debugging#/runtime/this-firefox` > Load Temporary Add-on > select `extension-firefox/manifest.json`

---

## Disclaimer

> **ParcelPulse non e' affiliato, associato, autorizzato, promosso o in alcun modo collegato ufficialmente ad Amazon.com, Inc. o alle sue sussidiarie.** Tutti i marchi, loghi e nomi di prodotto appartengono ai rispettivi proprietari. L'estensione utilizza esclusivamente le API interne di Amazon accessibili tramite la sessione autenticata dell'utente nel proprio browser. I dati di tracciamento non vengono mai trasmessi a terze parti.
>
> **ParcelPulse is not affiliated with, associated with, authorized by, endorsed by, or in any way officially connected with Amazon.com, Inc. or any of its subsidiaries.** All trademarks, logos, and product names belong to their respective owners. The extension exclusively uses Amazon's internal APIs accessible through the user's authenticated browser session. Tracking data is never transmitted to third parties.

---

<p align="center">
  <br>
  <strong>Made with :heart: from Abruzzo (Italy)</strong>
  <br><br>
  <img src="https://img.shields.io/badge/%F0%9F%8D%96%20W%20GLI-ARROSTICINI-FF6600?style=for-the-badge&labelColor=8B0000" alt="W GLI ARROSTICINI">
  <br><br>
  <em>Se questo progetto ti e' utile, offrimi un arrosticino (o 100, che uno solo non basta mai)</em>
  <br>
  <em>If you find this project useful, buy me an arrosticino (or 100, because one is never enough)</em>
  <br><br>
  &copy; 2025-2026 ParcelPulse by Loris Castorani
</p>
