# Spillorama-system: Arkitektur

**Dato:** 12. april 2026
**Status:** Nåværende tilstand

Dette dokumentet beskriver systemet slik det faktisk er bygget. Det er ment å leses av nye utviklere, konsulenter og revisorer som trenger et startpunkt. Detaljerte kontrakter og implementasjonsguider finnes i egne filer referert til under.

---

## 1. Systemkart

```
Kunde (nettleser)
  |
  +-- HTTPS --> /web/  (web-shell + Unity WebGL canvas)
  |               |
  |               |-- JS-bro --> Unity WebGL (spillmotor)
  |               |
  |               +-- HTTPS --> backend/src/index.ts
  |                               |
  |                               +-- PostgreSQL (wallet, limits, ledger)
  |                               +-- Firebase (auth)
  |                               +-- POST /api/games/candy/launch
  |                                       |
  |                                       +--> Candy-backend (server-til-server)
  |
Candy-backend
  +-- /api/ext-wallet/* --> backend (server-til-server, wallet-bro)
```

Web-shellen eier nå hele Spillvett-delen (grenser, regnskap) og fungerer som single source of truth for hallkontekst – i tråd med Lotteritilsynets krav til registrert spill og ansvarlig spill.

---

## 2. Tre lag

### 2.1 Backend (`backend/src/`)

Source of truth for alle pengebevegelser, regler og spillerkontekst.

| Ansvar | Fil / endepunkt |
|--------|----------------|
| Autentisering | Firebase-basert, `backend/src/index.ts` |
| Wallet (saldo, debit, credit) | `backend/src/index.ts`, `externalGameWallet.ts` |
| Spillegrenser (tapsgrense per hall) | `backend/src/spillevett/` |
| Spillregnskap | `GET /api/spillevett/report` |
| Eksport av spillregnskap | `POST /api/spillevett/report/export` |
| Compliance-data | `GET /api/wallet/me/compliance?hallId=...` |
| Ekstern spilllansering | `POST /api/games/:slug/launch` |
| Wallet-bro for eksterne spill | `GET/POST /api/ext-wallet/*` |

Systemet er **fail-closed**: hvis compliance-tjenesten er utilgjengelig, blokkeres spill.

### 2.2 Web-shell (`backend/public/web/`)

Kundens primære lobbyflate. Eier lobby, hallkontekst og Spillvett. Unity-canvaset rendres inne i denne siden.

| Ansvar | Fil |
|--------|-----|
| Lobby-skjelett og Unity-canvas | `index.html` |
| Hallvelger, Spillvett, spillregnskap | `spillvett.js` |
| Spill-knapper som åpner spill direkte | `spillvett.js` → `NavigateSpilloramaGame()` |
| Retur til lobby | → `LobbyPanel` shell-first tilstand |

Shell-en henter all compliance- og regnskapsdata fra backend direkte, med spillerens token og aktiv `hallId` som kontekst.

### 2.3 Unity WebGL (`Spillorama/`)

Spillmotor. Kjører i canvaset inne i web-shellen. Eier ikke lobby, konto eller Spillvett.

| Ansvar | Fil |
|--------|-----|
| JS-bro mot host | `UIManager.WebHostBridge.cs` |
| Skjuler kundevendt hallvelger i WebGL | `TopBarPanel.cs` |
| Shell-first lobby-tilstand | `LobbyPanel.cs` |
| Direkte spilllansering fra host | `LobbyGameSelection.cs` |

**Hva Unity sender til hosten:**
- Spiller-token (`SetPlayerToken`)
- Aktiv hall (`SetActiveHall`)
- Liste over godkjente haller med tapsgrenser (`SetApprovedHalls`)

**Hva hosten sender til Unity:**
- Bytt aktiv hall (`SwitchActiveHallFromHost`)
- Åpne spill (`NavigateSpilloramaGame`)
- Gå til lobby (`LobbyPanel` shell-first)

---

## 3. Hallkontekst-flyt

```
1. Spiller logger inn i Unity
2. Unity → host: SetPlayerToken(token)
3. Unity → host: SetActiveHall(hallId, hallName)
4. Unity → host: SetApprovedHalls(payloadJson)
5. Host → backend: GET /api/wallet/me/compliance?hallId=...
6. Host → backend: GET /api/spillevett/report?hallId=...
7. Shell viser Spillvett og spillregnskap for aktiv hall

Hallbytte (fra shell-nedtrekk):
8. Host → Unity: SwitchActiveHallFromHost(nyHallId)
9. Unity oppdaterer intern hall
10. Unity → host: SetActiveHall(nyHallId, ...) (bekreftelse)
11. Host henter compliance + regnskap på nytt for ny hall
```

Hallvalg er den eneste kilden til hvilke grenser og hvilket regnskap som vises. Spill og Spillvett er alltid i samme hallkontekst.

---

## 4. Candy-integrasjon

### 4.1 Hva som er på plass

| Del | Status |
|-----|--------|
| Launch-endepunkt `POST /api/games/candy/launch` | Implementert |
| Server-til-server kall til Candy-backend | Implementert |
| Wallet-bro (`/api/ext-wallet/*`) | Implementert |
| Candy-tile i Unity-lobbyen | Implementert |
| Unity kaller `OpenUrlInSameTab("/candy/")` | Implementert |

### 4.2 Kjent gap — iframe-embedding

`CANDY_SPILLORAMA_API_CONTRACT.md` og `UNITY_JS_BRIDGE_CONTRACT.md` beskriver Candy som et iframe-overlay i web-shellen.

**Faktisk nåværende implementasjon i `backend/public/web/index.html`:**
```javascript
function OpenUrlInSameTab(url) {
  existingTab = window.open(url, 'myUniqueTab');  // ← åpner ny fane, ikke iframe
}
```

Candy åpnes fortsatt i egen fane/vindu. iframe-integrasjonen er ikke ferdigstilt.

**Hva som gjenstår:**
- Bytte `OpenUrlInSameTab("/candy/")` til å vise et iframe-overlay i shellen
- Håndtere `postMessage`-protokollen mellom Candy og host (se `CANDY_SPILLORAMA_API_CONTRACT.md` §5)
- Lukke iframe og returnere til lobby etter at Candy avsluttes

### 4.5 Spillvett og compliance i web-shellen

Web-shellen er **eier av all kundevendt ansvarlig-spill-logikk**. Dette er et bevisst designvalg:

- Spillegrenser (netto tapsgrense per hall, dag og måned) håndheves sentralt i backend og vises proaktivt i shellen.
- Spillregnskap hentes via `GET /api/spillevett/report` og vises som kortversjon i sidefeltet og full rapport i skuff.
- Compliance-data (`GET /api/wallet/me/compliance`) inkluderer:
  - Gjenstående tapsgrense (dag/mnd) for aktiv hall — default 900 kr/dag og 4 400 kr/mnd (konfigurerbart via `BINGO_DAILY_LOSS_LIMIT` / `BINGO_MONTHLY_LOSS_LIMIT`)
  - Obligatorisk 5-minutters pause etter 60 min sammenhengende spilling (§ 66) — konfigurert via `BINGO_PLAY_SESSION_LIMIT_MS` og `BINGO_PAUSE_DURATION_MS`
  - Karenstid ved grenseøkning
  - Blokkeringsstatus (`restrictions.isBlocked`, dekker obligatorisk pause, frivillig pause og selvutestengelse)

**Dataflyt ved hallbytte:**
1. Bruker velger ny hall i shellens nedtrekksmeny.
2. `spillvett.js` sender `SwitchActiveHallFromHost(hallId)` til Unity via JS-broen.
3. Unity bekrefter ny aktiv hall med `SetActiveHall(hallId, hallName)`.
4. Shellen gjør ny compliance-fetch med den nye `hallId`.
5. Spillregnskap og grenser oppdateres umiddelbart i UI-et.

Dette sikrer at **hallkontekst og Spillvett alltid er synkronisert** — noe som var umulig da Unity eide hele lobbyen.

---

## 5. Feilhåndtering

Systemet er designet som **fail-closed** på alle compliance-relaterte punkter:

| Scenario | Nåværende oppførsel |
|----------|---------------------|
| Compliance-tjeneste utilgjengelig | Fail-closed: `complianceAllowsPlay()` blokkerer alle spillknapper i shellen |
| Token ikke sendt fra Unity ennå | Shell har ikke hallkontekst — spillknapper er deaktivert |
| Shell-init feiler (nettverksfeil mot backend) | `state.error` settes → spillknapper forblir deaktivert; brukeren ser feilmelding og må refreshe |
| Obligatorisk pause aktiv (60 min spilt) | `restrictions.isBlocked` er `true` → `complianceAllowsPlay()` returnerer `false` → spillknapper deaktivert; shell viser "Obligatorisk pause til HH:MM (§ 66)" |
| Selvutestengelse eller frivillig pause aktiv | `complianceAllowsPlay()` returnerer `false` → spillknapper deaktivert i shellen (backend blokkerer også) |
| Nærmer seg 60 min (>80% av grensen) | Shell viser proaktiv advarsel: "X min igjen til obligatorisk pause (§ 66)" |

Fail-closed gjelder nå både backend-siden og shell-siden. `complianceAllowsPlay()` i `spillvett.js` krever at compliance er hentet og feilfri før spillnavigasjon er mulig.

---

## 6. Gjenstående gap (prioritert)

| Gap | Konsekvens |
|-----|-----------|
Alle kjente arkitekturelle gap per 2026-04-12 er lukket:

| Gap | Lukket |
|-----|--------|
| Candy iframe-embedding | `launchCandyOverlay()` i `spillvett.js`; `OpenUrlInSameTab('/candy/')` ruter dit |
| Shell-init fail-closed | `complianceAllowsPlay()` blokkerer spillknapper til compliance er hentet og feilfri |
| `UNITY_JS_BRIDGE_CONTRACT.md` §2.7 feil om iframe | Oppdatert til å beskrive faktisk implementasjon |

---

## 7. Utviklingsregler

1. Hvis sluttbrukeren skal se funksjonen som del av lobby, konto eller Spillvett → bygg den i `/web/`-hosten, ikke i Unity.
2. Hvis funksjonen er administrativ → bygg den i `frontend/admin/` eller backend-admin.
3. Hvis funksjonen er del av selve spillopplevelsen → kan bygges i `Spillorama/`.
4. Backend er alltid source of truth for grenser, saldo og blokkeringer.

---

## 8. Relaterte dokumenter

| Dokument | Innhold |
|----------|---------|
| `UNITY_JS_BRIDGE_CONTRACT.md` | Komplett JS-bro-kontrakt mellom Unity og host |
| `CANDY_SPILLORAMA_API_CONTRACT.md` | Launch, wallet-bro, iframe-embedding og postMessage for Candy |
| `SPILLORAMA_LOBBY_ARCHITECTURE_RECOMMENDATION_2026-04-12.md` | Begrunnelse for shell-first-valget |
| `SPILLORAMA_SYSTEM_SCOPE_AND_SOURCE_OF_TRUTH_2026-04-12.md` | Avgrensning av operativt system |
| `UNITY_GAME_ARCHITECTURE_AND_CHANGE_GUIDE_2026-04-11.md` | Endringsguide for Unity-prosjektet |
| `SPILLVETT_HANDOVER_CHECKLIST_2026-04-11.md` | Sjekkliste for Spillvett-levering |
