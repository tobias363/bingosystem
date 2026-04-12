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

---

## 5. Feilhåndtering

| Scenario | Nåværende oppførsel |
|----------|---------------------|
| Compliance-tjeneste utilgjengelig | Fail-closed: spill blokkeres |
| Token ikke sendt fra Unity ennå | Shell har ikke hallkontekst, viser ikke data |
| Shell-init feiler (nettverksfeil mot backend) | Ingen definert fallback — Unity-UI er delvis deaktivert i WebGL |

**Udefinert gap:** hvis `spillvett.js` feiler under initialisering (f.eks. nettverksfeil mot compliance-endepunkt) og brukeren allerede er inne i Unity-canvaset, finnes det i dag ingen fallback som hindrer spill. Fail-closed-prinsippet som gjelder backend-siden er ikke eksplisitt håndhevet på shell-siden.

---

## 6. Gjenstående gap (prioritert)

| Gap | Konsekvens |
|-----|-----------|
| Candy iframe-embedding ikke implementert | Candy åpnes i ny fane, ikke integrert i lobby-opplevelsen |
| ~~Shell-init har ingen fail-closed fallback~~ | **Lukket 2026-04-12** — `complianceAllowsPlay()` i `spillvett.js` blokkerer spillknapper til compliance er hentet og feilfri |
| `UNITY_JS_BRIDGE_CONTRACT.md` §2.7 sier iframe er på plass — det er det ikke | Dokumentasjon er optimistisk, ikke deskriptiv |

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
