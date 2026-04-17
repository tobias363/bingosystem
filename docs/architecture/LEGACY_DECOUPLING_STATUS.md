# Legacy-avkobling — sannhets-kilde

**Eier:** Teknisk leder (Tobias Haugen)
**Linear-referanse:** [BIN-523](https://linear.app/bingosystem/issue/BIN-523)
**Prosjekt:** [Legacy-avkobling: Game 1–5 + backend-paritet](https://linear.app/bingosystem/project/legacy-avkobling-game-1-5-backend-paritet-a973e623234a)
**Sist oppdatert:** 2026-04-17

> **Denne fila er den eneste autoritative sannhets-kilden for hva "legacy" er og hvor vi står i avkoblingen.** Hvis annen dokumentasjon sier noe annet om legacy-status, har de feil og må rettes (se §6).

---

## 1. Formål

Prosjektet "Legacy-avkobling: Game 1–5 + backend-paritet" har som mål å fjerne all avhengighet til to legacy-systemer:

- **Legacy Unity-klient** (`legacy/unity-client/` — tidligere `Spillorama/`): Unity WebGL-spill, C#-kildekode, AIS-socket-basert kommunikasjon.
- **Legacy Node-backend** (`legacy/unity-backend/` — tidligere `unity-bingo-backend/`): Express + Socket.IO-server, Game1–5 JS-sockets, admin-panel, voucher-system, hall-display.

Fram til avkoblingen er fullført er begge i aktiv drift parallelt med ny stack (`apps/backend/` + `packages/game-client/`). Denne filen dokumenterer eksakt hvilke komponenter som fortsatt er aktive, hvor det finnes aktive kallere fra ny stack, og hvordan hver enkelt skal avkobles.

---

## 2. Definisjoner

| Begrep | Betydning |
|--------|-----------|
| **Legacy** | Kode, tabeller, kontrakter eller driftsflater som tilhører Unity-klient eller Node-backend fra før 2026-04. |
| **Ny stack** | TypeScript-prosjektene i `apps/backend/`, `apps/admin-web/`, `packages/game-client/`, `packages/shared-types/`. |
| **Koblet av** | En legacy-komponent har **null aktive kallere fra ny stack i runtime**. Koden kan fortsatt eksistere i `legacy/` (karantene), men ingen i ny stack importerer, kaller eller forventer den. |
| **Kapslet bort** | En legacy-komponent brukes fortsatt, men bak et eksplisitt adapter-lag eller iframe-grense slik at ny stack ikke vet om den. Dette er en midlertidig tilstand — målet er fortsatt full avkobling. |
| **Bridge-lagt-til** | En oversetter mellom legacy og ny stack eksisterer. Dette **teller ikke som avkoblet** — se §3. |

---

## 3. Policy: hva "avkoblet" betyr

**Vedtatt 2026-04-17 som del av senior-PM-review og BIN-523.**

Ingen legacy-avkobling-task kan markeres Done basert på at det er lagt til en bridge eller adapter. Akseptansekravet er alltid én av disse:

1. **Legacy-event-sti er fjernet.** Ingen kode i ny stack importerer, kaller eller lytter på den.
2. **Legacy-komponenten er kapslet bort.** Kommunikasjonen går gjennom et tydelig markert adapter-lag, og det finnes en konkret plan for senere full fjerning (ref: Linear-issue).

Hvis en task bare legger til en bridge uten å fjerne den underliggende legacy-stien eller dokumentere kapslingen, er den **ikke Done**. Reviewer må reåpne.

Kombineres med Done-policy i [`docs/engineering/ENGINEERING_WORKFLOW.md`](../engineering/ENGINEERING_WORKFLOW.md) §7:

1. Commit merget til `main`
2. `file:line`-bevis i issue-kommentar
3. Grønn CI-test
4. **Ett av kravene over** om avkobling eller kapsling

---

## 4. Matrise — per legacy-komponent

**Legende:**
- 🟢 **Koblet av** — ingen aktive kallere fra ny stack
- 🟡 **Kapslet bort** — brukes, men bak adapter; fjerningsplan finnes
- 🔴 **Aktiv i runtime** — ny stack avhenger fortsatt direkte
- ⚫ **Død kode** — fortsatt i `legacy/`, men ingen kaller den noe sted

Data verifisert 2026-04-17 ved `grep` i `apps/`, `packages/`, `legacy/`.

### 4.1 Unity-klient-komponenter (C#)

| Komponent | Sti i repo | Runtime-status | Refs i ny stack | Plan |
|-----------|------------|----------------|-----------------|------|
| `GameSocketManager` | `legacy/unity-client/Assets/_Project/_Scripts/Socket Manager/GameSocketManager.cs` | ⚫ Død kode i Game1–5-scripts (grep `GameSocketManager.SocketGame` i `Game1/…Game5/` gir 0 treff) men klassen kompileres fortsatt med Unity-bygget | 0 | Slettes når `legacy/unity-client/` flyttes til arkiv-repo (se [LEGACY_DELETION_PLAN.md](../operations/LEGACY_DELETION_PLAN.md)) |
| `EventManager.*.cs` (Gameplay, Platform, AuthProfile) | `legacy/unity-client/Assets/_Project/_Scripts/Socket Manager/EventManager*.cs` | ⚫ Død kode i Game1–5-scripts | 0 | Samme som over |
| `SpilloramaGameBridge.cs` | `legacy/unity-client/Assets/_Project/_Scripts/Bridge/SpilloramaGameBridge.cs` | 🟡 Fortsatt brukt av Unity-klient-kode som oversetter Spillorama-events til C#-typer | Referert i kommentarer: `packages/game-client/src/bridge/GameBridge.ts:108` ("Replaces SpilloramaGameBridge.cs from Unity"), `packages/game-client/src/games/game1/colors/TicketColorThemes.ts:206` | Fjernes når Unity-klient deaktiveres per feature-flag og pilot er verifisert |
| `SpilloramaSocketManager.cs` | `legacy/unity-client/Assets/_Project/_Scripts/Network/SpilloramaSocketManager.cs` | 🟡 Aktiv i Unity-klient-runtime | 0 direkte kall fra ny stack | Samme som over |
| `SpilloramaApiClient.cs` | `legacy/unity-client/Assets/_Project/_Scripts/Network/SpilloramaApiClient.cs` | 🟡 REST-klient for Unity mot `apps/backend/` | 0 (kun intern Unity) | Fjernes samtidig med Unity-klient-deaktivering |
| Voucher UI-kode | `legacy/unity-client/Assets/_Project/_Scripts/Prefabs/Voucher/…` | ⚫ Knyttet til Game 4 (utgår per BIN-496) | 0 | Slettes per [BIN-496](https://linear.app/bingosystem/issue/BIN-496) |

### 4.2 Legacy Node-backend-komponenter

| Komponent | Sti i repo | Runtime-status | Refs i ny stack | Plan |
|-----------|------------|----------------|-----------------|------|
| Game1 socket-handlere | `legacy/unity-backend/Game/Game1/Sockets/game1.js` | 🔴 Kjører i prod (service `Spillorama-system` på Render per 2026-04-17) | Ingen direkte kode-ref, men runtime-trafikk fra Unity-klient går hit | Deaktiveres når web-native Game 1 tar over prod-trafikk (feature-flag per [BIN-540](https://linear.app/bingosystem/issue/BIN-540)) |
| Game2 socket-handlere | `legacy/unity-backend/Game/Game2/Sockets/game2.js` | 🔴 Kjører i prod | Ingen direkte | Deaktiveres etter G2-paritet ([BIN-529](https://linear.app/bingosystem/issue/BIN-529)) |
| Game3 socket-handlere | `legacy/unity-backend/Game/Game3/Sockets/game3.js` | 🔴 Kjører i prod | Ingen direkte | Deaktiveres etter G3-paritet ([BIN-530](https://linear.app/bingosystem/issue/BIN-530)) |
| Game4 socket-handlere | `legacy/unity-backend/Game/Game4/Sockets/game4.js` | 🔴 Kjører i prod (voucher + themes) | 0 | Utgår per [BIN-496](https://linear.app/bingosystem/issue/BIN-496) — setter `is_active = false` i DB |
| Game5 socket-handlere | `legacy/unity-backend/Game/Game5/Sockets/game5.js` | 🔴 Kjører i prod | Ingen direkte | Deaktiveres etter G5-paritet ([BIN-531](https://linear.app/bingosystem/issue/BIN-531)) |
| Admin-panel HTML views | `legacy/unity-backend/App/Views/**` | 🔴 Kjører i prod | 0 | Erstattes av `apps/admin-web/` (delvis levert, BIN-517) |
| Voucher-system | `legacy/unity-backend/App/Controllers/VoucherController.js`, `App/Views/VoucherManagement/**` | ⚫ I praksis død (kun Game 4 aktiv) | 0 | Arkiveres når Game 4 fjernes per BIN-496 (ref BIN-497) |
| Hall-display / TV-skjerm | `legacy/unity-backend/Game/Game1/Sockets/game1.js:123` (`AdminHallDisplayLogin`), `:244` (`TvscreenUrlForPlayers`) | 🔴 Brukes av fysiske bingosaler | Ny stack mangler ekvivalent (verifisert 2026-04-17: `grep "hall:tv-url\|AdminHallDisplay" apps/backend/src/` = 0 treff) | Port til ny stack i [BIN-498](https://linear.app/bingosystem/issue/BIN-498) |
| Report/rapport-controllere | `legacy/unity-backend/App/Controllers/ReportController.js` | 🔴 Brukes av admin for hall-omsetning | 0 | Erstattes av admin-dashboard i ny stack ([BIN-517](https://linear.app/bingosystem/issue/BIN-517)) |

### 4.3 AIS-spor i ny stack — kun kommentarer, ingen runtime-refs

Verifisert med `grep -rn "AIS\|legacy\|unity-backend\|SpilloramaGameBridge" apps/backend/src packages/game-client/src packages/shared-types/src`:

| Fil:linje | Type | Skal ryddes? |
|-----------|------|--------------|
| `apps/backend/src/game/variantConfig.ts:4` | Kommentar: "Ports the old AIS subGame1 system where admin configures…" | Behold som historisk kontekst; merk som 📚 `LEGACY-REF-HISTORICAL` hvis ønsket |
| `apps/backend/src/util/roomHelpers.ts:200` | Kommentar: "Running game or legacy arm — calculate from actual tickets" | "legacy" her refererer til eldre client-arm-state, ikke Unity. Omdøp til "pre-refactor arm" for klarhet |
| `apps/backend/src/platform/PlatformService.ts:2134` | Kommentar: "avoids locking out existing users with legacy passwords" | Uavhengig av Unity — beholdes |
| `packages/game-client/src/bridge/GameBridge.ts:108` | Kommentar: "Replaces SpilloramaGameBridge.cs from Unity" | Behold som port-sporingsnotat |
| `packages/game-client/src/games/game1/colors/TicketColorThemes.ts:206` | Kommentar: "match color names used in TicketColorManager and SpilloramaGameBridge" | Oppdater til å referere C#-fil i `legacy/unity-client/...` hvis ønsket |

**Konklusjon:** Ingen aktive runtime-kall fra ny stack til legacy. Alle referanser er kommentarer/kontekst.

---

## 5. Prod-driftsstatus per 2026-04-17

Verifisert mot Render-dashboard + `spillorama-system.onrender.com`:

| Service | Path i repo | Status | Kommentar |
|---------|-------------|--------|-----------|
| `Spillorama-system` (Render `srv-d7bvpel8nd3s73fi7r4g`) | `legacy/unity-backend/` | Live | `/health`, `/web/`, `/` returnerer 200. Root directory oppdatert etter restrukturering (Linear [BIN-548](https://linear.app/bingosystem/issue/BIN-548)). |
| Ny `apps/backend/` | `apps/backend/` | **Ikke deployet noe sted** | `render.yaml` i repo peker hit, men dashboard vinner. Beslutning om pilot-service hører til [BIN-540](https://linear.app/bingosystem/issue/BIN-540) / [BIN-548](https://linear.app/bingosystem/issue/BIN-548). |
| `candy-backend` | Candy-repo (ikke i Spillorama-system) | Live | Ikke berørt av denne avkoblingen |

---

## 6. Motstridende påstander å rydde

Følgende dokumenter sier noe som ikke stemmer med faktisk kodetilstand. De må rettes — listet med hvor i dokumentet påstanden står og hva som skal erstattes:

| Dokument | Påstand | Faktisk | Handling |
|----------|---------|---------|----------|
| `legacy/unity-client/Assets/_Project/_Scripts/GAME_DEVELOPER_GUIDE.md:7-13` | "Det gamle AIS-systemet (`GameSocketManager` / `EventManager` / `BestHTTP.SocketIO`) er fullstendig fjernet fra alle spillskript (Game 1-5)." | Korrekt *for Game1-5-scripts*. Men `GameSocketManager.cs` og `EventManager.*.cs` finnes fortsatt i `Socket Manager/`-mappen og kompileres med Unity. Påstanden gir inntrykk av at de er borte fra repoet, som er feil. | Presiser: "er fjernet fra Game1-5-scriptene, men klassene kompileres fortsatt med Unity-bygget inntil sletting per [LEGACY_DELETION_PLAN.md](../../docs/operations/LEGACY_DELETION_PLAN.md)." |
| `packages/game-client/src/games/game1/README.md:11` | Nevner "auto-arm ved join" | `Game1Controller.ts:156-157` fjerner auto-arm eksplisitt | Ryddes som del av [BIN-528](https://linear.app/bingosystem/issue/BIN-528) canonical spec |
| `legacy/docs/UNITY_GAME_ARCHITECTURE_AND_CHANGE_GUIDE_2026-04-11.md:210-238` | Beskriver Game 4 som aktiv del av endringsflaten | `packages/game-client/src/games/registry.ts:37-40` har ikke Game 4 | Ryddes per [BIN-524](https://linear.app/bingosystem/issue/BIN-524) |
| `packages/game-client/src/games/game1/STATUSRAPPORT-2026-04-16.md:211` | Sier MAX_DRAWS klampet til 75 | `apps/backend/src/util/envConfig.ts:59` er fortsatt 60 | Fikses i [BIN-520](https://linear.app/bingosystem/issue/BIN-520); statusrapporten arkiveres til `docs/archive/` når BIN-528 er ferdig |

---

## 7. Hvordan oppdatere denne filen

Denne fila er en *levende* sannhets-kilde. Enhver endring i legacy-runtime-status skal oppdatere fila, ikke bare Linear-issuen.

**Når skal du redigere denne fila:**

1. Du har gjort en endring som fjerner en legacy-komponent (f.eks. slettet en handler, fjernet en import).
2. Du har lagt til en bridge/adapter som endrer en linje i matrisen fra 🔴 → 🟡.
3. Du oppdager en ny legacy-komponent som ikke er oppført.
4. Du har rettet et motstridende dokument i §6.

**Commit-melding:**

```
docs(legacy-avkobling): update decoupling status (<kort beskrivelse>)
```

Referer Linear-issuen du lukker. Eksempel:

```
docs(legacy-avkobling): Game 4 socket handlers disabled — BIN-496

Matrise §4.2: Game4 socket-handlere 🔴 → ⚫
```

**PR-review-krav:** Når legacy-avkobling-PR-er merges, må `§4` i denne fila oppdateres i samme commit. PR-reviewer skal blokkere merge hvis matrisen ikke er rørt.

---

## 8. Exit-kriterium for prosjektet

Når hele matrisen i §4 er 🟢 (null 🔴 eller 🟡) og [LEGACY_DELETION_PLAN.md](../operations/LEGACY_DELETION_PLAN.md) §3 DoD-sjekklisten er oppfylt, er prosjektet ferdig og `legacy/` kan slettes/arkiveres per den planen.

---

## 9. Revisjonshistorikk

| Dato | Hvem | Endring |
|------|------|---------|
| 2026-04-17 | Tobias Haugen (via senior-PM-review) | Initial versjon. Matrise etablert basert på kode-grep + PM-review. |
