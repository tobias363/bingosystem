# Arkitekturgjennomgang: Frontend Portal (Senior Consultant Report)

Etter å ha byttet ut "Lobby-fikser-hatten" med "Konsulent-brillene", har jeg tatt et dypdykk i selve fundamentet (spesielt `index.html` og samspillet med innlogging). Selv om vi nå har skissert moduler og Alpine.js for å rydde opp i grensesnittet, finnes det **fire dypere tekniske gjeldsposter** som burde adresseres før systemet lanseres til hundretusenvis av betalende spillere.

Her er min vurdering av de mest kritiske områdene dere bør vurdere å utbedre:

## 1. Sikkerhetsrisiko: URL Token Injection (Kritisk)
I bunnen av `index.html` ligger et script som henter ut `?token=...` rett fra adresselinjen og lagrer det i nettleserens `localStorage`.
- **Problemet:** Dette er en klassisk sikkerhetsfelle. Enhver ondsinnet tredjepart som får tak i URL-en (som ofte printes fulltekst i server-logger og nettleserhistorikk) kan kapre sesjonen. Det åpner også for "Token Injection" hvor noen kan lure en spiller til å operere på andres bankkonto.
- **Måten å gjøre det på:** Bruk av HTTP-Only Secure Cookies. Autentisering bør settes fra backend slik at ingen JavaScript-kode engang kan lese tokenet (eliminerer 99% av alle XSS sårbarheter). Hvis URL-autorisering er absolutt nødvendig pga iframe-teknologi, bør det brukes One-Time-Tokens som *veksles inn* mot en cookie, ikke rå-tokens.

## 2. "Hackete" Polling for Auto-Launch (Brittle Logic)
For å autostarte Candy-spillet via embed-modus brukes `setInterval` (linje 361 i `index.html`). Koden prøver desperat å sjekke om knappen `#candyPlayBtn` er "klar" 40 ganger før den gir opp.
- **Problemet:** Dette kalles "DOM Polling" og er en anti-pattern. På en rask maskin er alt vel, men på en treig mobil på 3G faller denne ofte fra hverandre fordi knappen ikke rekker å tegne seg før timeouten dreper funksjonen. Da fanger ikke systemet opp klikket, og spillet forblir svart.
- **Måten å gjøre det på:** Applikasjonen må sende ut et signal når den er ferdig initiert, for eksempel `document.dispatchEvent(new Event('bingo:ready'))`. Embed-scriptet lytter bare passivt etter dette ene unike vindkastet.

## 3. Risiko for "Global Scope Pollution"
Variabler blør ut. `window.__EMBED_MODE = true` er satt løst.
- **Problemet:** Dette spiser opp navnerommet i nettleseren. Når man hoster web-spill levert fra andre motorer (Unity/WebGL), kommer det ofte egne globale variabler flyvende. Kollisjoner oppstår ut av det blå.
- **Måten å gjøre det på:** Konfigurasjon bør ligge i DOM'en som standard: `<body data-embed-mode="true">`. Da unngår vi globale "løse kanoner" i scriptene våre. Variablene avleses robust med `document.body.dataset.embedMode`.

## 4. Zero E2E-Testing & Monolittisk CSS
Frontend-koden har pr. nå verken Playwright- eller Cypress-tester. `style.css` har passert 22 KB og begynner å miste all formidabel CSS-arkitektur.
- **Problemet:** Når du skal endre fargen på en knapp i Lobbyen, aner du ikke om det plutselig bryter designet inni Admin-visningen, fordi stilene er sauset sammen. Og uten automatiserte nettlesertester kan deploy-skriptet spinne opp endringer som rett og slett gir blank skjerm.
- **Måten å gjøre det på:** Del opp CSS i moduler (f.eks. `lobby.css`, `admin.css`) og integrer Playwright i CI/CD pipelinen deres som en portvakt. Den logger inn, laster lobbyen virtuelt, og verifiserer at alt vises *før* det shippes til produksjon.

---

## Addendum etter produksjonsfeil 9. april 2026

Etter denne rapporten ble det avdekket en konkret produksjonsfeil i selve Unity-hostingen på `https://bingo-system-jsso.onrender.com/web/`. Den feilen lå **ikke** i portalens embed-autostart alene, men i kontrakten mellom host-siden og Unity WebGL-builden. Rapporten bør derfor utvides med følgende punkter:

## 5. Scope må skilles tydeligere: Portal vs Unity Host Page
Denne rapporten beskriver i hovedsak frontend-portalen og embed-flyten i `frontend/index.html`.
- **Problemet:** Det er lett å lese rapporten som om alle funn gjelder lobbyen i produksjon, men lobbyen består i praksis av minst to forskjellige host-miljøer med ulik risikoprofil:
  - `frontend/index.html` for portal/embed-logikk
  - `bingo_in_20_3_26_latest/public/web/index.html` for Unity WebGL-hosting
- **Konsekvens:** Når disse blandes, kan man bruke tid på å rydde embed-polling og globals i portalen, mens den faktiske produksjonsstopperen ligger i Unity-host-siden.
- **Måten å gjøre det på:** Legg inn en egen seksjon tidlig i dokumentet kalt **Scope / Affected Files** som eksplisitt sier hvilke filer og runtime-miljøer hvert funn gjelder.

## 6. Kritisk kontraktsrisiko: Host Page <-> Unity JavaScript Bridge
Unity WebGL-builden forventer at host-siden eksponerer bestemte JavaScript-funksjoner.
- **Problemet:** 9. april 2026 manglet `requestDomainData()` i `/web/index.html`, mens Unity-builden kalte denne funksjonen i startup. Resultatet var en `ReferenceError`, manglende `DomainDataCall(...)` tilbake til GameObject `"Socket And Event Manager"`, og appen ble stående på splash-screen i stedet for å gå til login.
- **Konsekvens:** Selv en korrekt Unity-build kan være ubrukelig i produksjon dersom host-siden ikke matcher forventet JS-bro.
- **Måten å gjøre det på:** Dokumenter alle host-funksjoner Unity forventer som en eksplisitt kontrakt. Minimum:
  - hvilke globale funksjoner Unity kaller
  - hvilke `SendMessage(...)`-mål som må finnes
  - hvilke argumenter som forventes
  - hva som er blokkende hvis host-siden avviker

## 7. Observability mangler i nettleseren
Rapporten peker riktig på manglende E2E-tester, men ikke på manglende runtime-observability i selve host-siden.
- **Problemet:** Når WebGL starter, skjer feilene i skjæringspunktet mellom HTML, loader-script, `SendMessage`, sockets og auth. Uten synlig runtime-logging ender teamet opp med å gjette.
- **Måten å gjøre det på:** Ha en eksplisitt debug-modus i host-siden, for eksempel `?debug=1`, som viser:
  - om Unity loader-scriptet ble lastet
  - om `requestDomainData()` ble kalt
  - om `SendMessage(...)` lyktes
  - om socket-tilkobling faktisk ble opprettet
  - om auth-token ble satt
- **Hvorfor dette er viktig:** Dette gjør at man kan feilsøke i produksjon uten å være avhengig av åpne DevTools eller manuell reproduksjon på én bestemt maskin.

## 8. Release Gate må teste `/web/`, ikke bare generisk frontend
Generiske Playwright-tester er bra, men for denne løsningen er de ikke tilstrekkelige alene.
- **Problemet:** En deploy kan være "grønn" samtidig som `/web/` fortsatt står fast på splash-screen fordi host-siden og Unity-builden ikke matcher.
- **Måten å gjøre det på:** Legg inn en egen release gate for WebGL-lobbyen med minimum disse sjekkene:
  - åpne `/web/`
  - vent på at login-feltene faktisk vises
  - fail testen hvis det oppstår `ReferenceError` eller `unhandledrejection`
  - verifiser at socket-oppstart faktisk skjer
  - verifiser at lobbyen ikke blir stående permanent på splash/loading state

## 9. Unity Build og Host HTML må behandles som ett deploybart sett
I praksis er ikke Unity-builden alene deploybar.
- **Problemet:** `Build/*.unityweb` og host-filen `public/web/index.html` er tett koblet. Endres bare den ene siden, kan produksjon bryte selv om begge delene isolert sett ser riktige ut.
- **Måten å gjøre det på:** Dokumenter og håndhev at disse deployes som ett samlet artifact:
  - Unity WebGL build
  - host `index.html`
  - tilhørende `external-games.js` / auth-bridge / wallet-bridge
  - verifikasjon mot faktisk Render-URL etter deploy

## Anbefalt tillegg i rapporten
For å gjøre dokumentet mer presist bør rapporten få en kort sluttseksjon med tre tydelige operasjonelle lærdommer:
- **Skill mellom portal og Unity-hosting.** De er to forskjellige systemer med ulike failure modes.
- **Test den faktiske produksjonsruten `/web/`.** Ikke stol på at "frontend bygget" betyr at lobbyen virker.
- **Bygg debug inn i host-siden.** Når WebGL, HTML og auth møtes, er synlig runtime-logging en nødvendighet, ikke en luksus.
