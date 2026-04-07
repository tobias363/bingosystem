# BIN-134: Arbeidsrapport — 7. april 2026

## Oversikt

Denne sesjonen dekket feilretting og forbedringer av CandyMania-integrasjonen i Spillorama. Arbeidet er fordelt på to repoer: `bingosystem` (Unity-lobby + bingo-backend) og `candy-backend` + `candy-web` (i monorepo Bingo).

**Branch:** `fix/candy-tile-auth-gating` → PR #63
**Commits:** 9 stk, 12 filer endret, 229 linjer inn / 215 linjer ut

---

## Hva som ble gjort

### 1. CandyMania tile — auth-gating + visuell match (Unity-lobby)

**Filer:**
- `bingo_in_20_3_26_latest/App/Routes/integration.js`
- `bingo_in_20_3_26_latest/public/web/index.html`
- `bingo_in_20_3_26_latest/public/web/external-games.js`

**Endringer:**
- Auth-beacon filtrerer nå `ConnectedPlayers` til kun `status === "Online"` — stale offline-spillere trigger ikke lenger `authenticated: true`
- Client-side: `_unityLoaded` flagg — CandyMania-tile vises ikke før Unity er ferdig lastet
- Auth-beacon krever gyldig token (ikke bare `authenticated: true` uten token)
- CandyMania-tile redesignet til å visuelt matche Unity-lobbyens spillkort
- Debug-panel (grønn tekst nederst) fjernet fra produksjon — logging går til `console.log`

### 2. Ticket-generering — 3x5 grid

**Fil:** `backend/src/game/ticket.ts`

Backend genererte 5×5 grid (25 celler) men frontend forventet 3×5 (15 celler). Frontend kuttet til 15 og free-center (verdi 0) vistes som tomme celler. Nå genereres 3 rader × 5 kolonner med alle celler fylt.

### 3. Board-markeringer — kun med aktiv innsats

**Filer:**
- `candy-web/src/features/theme1/hooks/useTheme1Store.ts`

`markBoards` i `applyPendingDrawPresentation` sjekker nå `isCurrentPlayerArmed()` — bonger markeres kun når spilleren aktivt har plassert innsats. I `applyLiveSnapshot` brukes kun `ticketSource === "currentGame"` (uten armed-sjekk) fordi server-modellen allerede har korrekte marks.

### 4. Tall beholdes mellom runder

**Fil:** `candy-web/src/domain/theme1/mappers/theme1TicketResolution.ts`

`resolvePlayerContext` bruker nå `currentGame.tickets` også når status er `FINISHED` eller `ENDED` (så lenge det ikke finnes `preRoundTickets`). Bonger tømmes ikke lenger mellom runder.

### 5. Board-mark clearing basert på bet-state

**Fil:** `candy-web/src/features/theme1/components/Theme1GameShell.tsx`

- **Med innsats:** Markeringer fader ut 3 sek før neste runde
- **Uten innsats:** Markeringer beholdes gjennom neste runde, nullstilles runden etter
- CSS transition på `.board__cell-surface` for 0.5s fade-effekt

### 6. Debug-cleanup i candy-web

**Fil:** `candy-web/src/features/theme1/hooks/useTheme1Store.ts`

- Alle 25+ `console.log("[BIN-134]...")` debug-linjer fjernet
- Portal-redirects re-aktivert (var disabled for iframe-debugging)
- Launch-token-flyt forenklet
- Auto-bootstrap aktivert for localhost (lokal utvikling)

### 7. Ball-animasjon — draw protection

**Filer:**
- `candy-web/src/features/theme1/hooks/theme1LiveSync.ts` — ny `drawPresentationActiveUntilMs` felt
- `candy-web/src/features/theme1/hooks/useTheme1Store.ts` — beskyttelsesvindu
- `candy-web/src/features/theme1/components/theme1DrawMachine.css` — output ball scale-in

**Status: UFULLSTENDIG — se kjent problem nedenfor.**

### 8. DB error logging

**Fil:** `backend/src/platform/PlatformService.ts`

`wrapError()` logger nå den faktiske feilen til konsoll før den pakker den inn i `PLATFORM_DB_ERROR`.

---

## Kjent problem — ball-animasjon

Output-ballen og flying-ballen vises **samtidig** ved hver trekning. Se `docs/BALL_ANIMATION_HANDOFF.md` for full teknisk handoff.

**Sannsynlig årsak:** CSS `transition` på output-ball (scale 0→1 over 350ms) kjører samtidig med flying-ball RAF-animasjon. `suppressedOutputBallNumber` setter `opacity: 0` men CSS transition overskriver timingen.

**Foreslått fix:** Rull tilbake `theme1DrawMachine.css` til original (kun `opacity: 0` uten transition).

---

## Lokal utvikling

### Forutsetninger
- Node.js (finnes i `/opt/homebrew/Cellar/node/25.8.1_1/bin/`)
- PostgreSQL lokalt med database `bingo`

### Start alt
```bash
./scripts/dev.sh
```
- Backend: http://localhost:4000 (Express + Socket.IO, hot-reload)
- Frontend: http://localhost:4174 (Vite, hot-reload)

### Manuell start (to terminaler)
```bash
# Terminal 1 — Backend
cd backend
ADMIN_BOOTSTRAP_SECRET=dev npm run dev

# Terminal 2 — Frontend
cd candy-web
VITE_CANDY_API_BASE_URL=http://127.0.0.1:4000 npm run dev
```

### Admin-panel
1. Gå til http://localhost:4000/admin/
2. Logg inn med `test@test.no` / `test1234`
3. Brukeren er ADMIN med 27/27 permissions
4. Under "Candy (spill + drift)" kan du endre trekk-intervall, RTP, auto-start etc.

### Opprette admin-bruker (første gang)
```bash
# 1. Opprett bruker
curl -s http://127.0.0.1:4000/api/auth/register -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.no","password":"test1234","displayName":"Tobias Test"}'

# 2. Promoter til admin (krever ADMIN_BOOTSTRAP_SECRET env)
curl -s http://127.0.0.1:4000/api/admin/bootstrap -X POST \
  -H "Content-Type: application/json" \
  -d '{"secret":"dev","email":"test@test.no","password":"test1234"}'
```

### Wallet-konfigurasjon
`.env` har `WALLET_PROVIDER=postgres` med lokal Postgres. House-wallet må finnes:
```sql
INSERT INTO wallet_accounts (id, balance)
VALUES ('house-hall-default-databingo-internet', 100000)
ON CONFLICT (id) DO NOTHING;
```

### Deploy til produksjon
```bash
./scripts/deploy.sh
```
Bygger frontend + backend, kjører tester, viser git-kommandoer for push. Render deployer automatisk etter push til main.

### Kjøre tester
```bash
# Candy-web (166 tester)
cd candy-web && npx vitest run

# Backend (22 tester)
cd backend && npm test
```

---

## Filstruktur — viktige filer

```
Bingo/
├── backend/                          ← candy-backend
│   ├── src/
│   │   ├── index.ts                  ← Hovedserver, API endpoints, Socket.IO
│   │   ├── game/
│   │   │   ├── ticket.ts             ← Ticket-generering (3x5 grid)
│   │   │   └── BingoEngine.ts        ← Spillmotor
│   │   └── platform/
│   │       └── PlatformService.ts    ← DB, auth, game catalog
│   └── .env                          ← Miljøvariabler
├── candy-web/                        ← React frontend (Vite)
│   └── src/
│       ├── domain/theme1/
│       │   ├── applyTheme1DrawPresentation.ts  ← Ball → board marking
│       │   └── mappers/
│       │       ├── mapRoomSnapshotToTheme1.ts  ← Server → render model
│       │       └── theme1TicketResolution.ts   ← Ticket source logic
│       └── features/theme1/
│           ├── components/
│           │   ├── Theme1Playfield.tsx          ← Ball flight animation
│           │   ├── Theme1DrawMachine.tsx        ← Globe + output ball
│           │   ├── Theme1GameShell.tsx          ← Hovedcontainer, countdown
│           │   └── Theme1BoardGrid.tsx          ← Bong-rendering
│           └── hooks/
│               ├── useTheme1Store.ts            ← Zustand state management
│               └── theme1LiveSync.ts            ← Sync helpers + types
├── bingo_in_20_3_26_latest/          ← Unity-lobby (bingo-system)
│   ├── public/web/
│   │   ├── index.html                ← Unity WebGL host + auth-beacon
│   │   └── external-games.js         ← CandyMania tile overlay
│   └── App/Routes/
│       └── integration.js            ← Auth-beacon + wallet bridge
├── scripts/
│   ├── dev.sh                        ← Start lokal utvikling
│   └── deploy.sh                     ← Bygg + deploy
└── docs/
    ├── BALL_ANIMATION_HANDOFF.md     ← Teknisk handoff for ball-bug
    └── BIN-134_SESSION_RAPPORT_2026-04-07.md  ← Denne filen
```

---

## Detaljert commit-logg (kronologisk)

### 1. `abf66adf` — Auth-gating + tile redesign + debug panel (10:02)
**Filer:** `integration.js`, `index.html`, `external-games.js` (Unity-lobby)

Hva ble gjort:
- `integration.js` linje ~142: La til `.filter(id => connected[id] && connected[id].status === 'Online')` på `ConnectedPlayers`-sjekken i auth-beacon endpointet. Uten dette returnerte auth-beacon `authenticated: true` for spillere med status "Offline" (disconnect setter status men sletter ikke entry).
- `index.html`: La til `var _unityLoaded = false;` øverst. Settes til `true` i Unity load-callback (etter `createUnityInstance`). Auth-beacon polling sjekker `if (!_unityLoaded) return;` — ignorerer auth-svar før Unity er lastet.
- `index.html`: Fjernet `<div id="debug-panel">`, all CSS for debug-panel, og `dbg()`-funksjonen som skrev til DOM. Erstattet med `function dbg(msg) { console.log('[BIN-134]', msg); }`.
- `index.html`: Fjernet verbose PostMessage-logging, iframe nav-checks, stack trace i `closeGameOverlay()`.
- `external-games.js`: Redesignet tile CSS — fjernet glassmorfisme-boks, lagt til flat design som matcher Unity-kortene (spinner, badge, teal-knapp).

Hvorfor: CandyMania-tile vistes på login-skjermen fordi auth-beacon rapporterte stale sessions. Debug-panelet var synlig for sluttbrukere.

### 2. `b5e0e8b6` — 3x5 ticket grid (10:13)
**Fil:** `backend/src/game/ticket.ts`

Hva ble gjort:
- Endret `BOARD_SIZE = 5` til `BOARD_ROWS = 3; BOARD_COLS = 5;`
- `generateTraditional75Ticket()`: Endret fra 5×5 grid med free center til 3×5 grid der alle 15 celler har tall
- Hver kolonne: `pickUniqueInRange(start, end, BOARD_ROWS)` — 3 tall per kolonne
- `findFirstCompleteLinePatternIndex()`: Bruker nå `ticket.grid.length` og `ticket.grid[0].length` i stedet for hardkodet `BOARD_SIZE`. Fjernet diagonal-sjekk (ikke relevant for 3×5).

Hvorfor: Frontend (`THEME1_CARD_CELL_COUNT = 15`) forventet 15 celler. Backend sendte 25. Frontend kuttet til 15 og free-center (verdi 0) vistes som tomme celler.

### 3. `24e0747a` — Debug cleanup + redirect fix (12:20)
**Filer:** `useTheme1Store.ts`, `PlatformService.ts`

Hva ble gjort:
- `useTheme1Store.ts`: Fjernet alle `console.log("[BIN-134]...")` og `console.error("[BIN-134]...")` linjer (25+ stk).
- Re-aktiverte `redirectTheme1ToPortal()` som var kommentert ut med "BIN-134 DEBUG: disabled". Tre steder: connect-funksjonen, applyStableMachineState, autoCreateLiveRoom catch.
- Forenklet `hydrateSessionFromLaunchToken`: Sjekker eksisterende session først (accessToken + roomCode/hallId), deretter launch token. Før: alltid kalte launch-resolve når launch token fantes.
- Aktiverte `shouldAutoBootstrapDefaultLiveSession` for localhost: returnerer `true` når `isLocalTheme1RuntimeHost(hostname)` og ingen launch token. Gjør at lokal dev auto-oppretter bruker og kobler til backend.
- `PlatformService.ts` linje 1785: La til `console.error("[PlatformService] DB error:", error);` i `wrapError()` slik at faktisk DB-feil logges før den pakkes inn i generisk `PLATFORM_DB_ERROR`.

Hvorfor: Debug-logging fylte konsollen. Redirects var disabled under iframe-debugging. Auto-bootstrap trengs for lokal utvikling.

### 4. `c18b9bff` — Board marks kun med aktiv bet (12:28)
**Filer:** `useTheme1Store.ts`, `useTheme1Store.stake.test.ts`

Hva ble gjort:
- `applyPendingDrawPresentation` (~linje 1867): Endret `markBoards: currentState.runtime.lastTicketSource === "currentGame"` til `markBoards: currentState.runtime.lastTicketSource === "currentGame" && pendingPlayerArmed` der `pendingPlayerArmed = isCurrentPlayerArmed(currentState)`.
- Samme endring i `applyLiveSnapshot` (~linje 1137).
- Oppdaterte test: "does not auto-bootstrap on localhost either" → "auto-bootstraps on localhost for local dev", `.toBe(false)` → `.toBe(true)`.

Hvorfor: Med `AUTO_ROUND_ENTRY_FEE=0` fikk alle spillere tickets automatisk. `ticketSource === "currentGame"` var alltid `true`, og bonger ble markert selv uten innsats.

**NB:** `applyLiveSnapshot`-sjekken ble senere fjernet i commit `f20f3902` — se under.

### 5. `379ed400` — Behold tall mellom runder (12:33)
**Fil:** `candy-web/src/domain/theme1/mappers/theme1TicketResolution.ts`

Hva ble gjort:
- `resolvePlayerContext` linje ~22: Endret `shouldUseCurrentGameTickets` fra `currentGameStatus === "RUNNING"` til:
  ```
  currentGameStatus === "RUNNING" ||
  ((currentGameStatus === "FINISHED" || currentGameStatus === "ENDED") && !hasPreRoundTickets)
  ```
- `hasPreRoundTickets = Object.keys(preRoundTicketMap).length > 0`

Hvorfor: Når runden var ferdig, falt `resolvePlayerContext` gjennom til `source: "empty"` med tomme tickets — bongene ble blanke. Nå brukes `currentGame.tickets` også etter runden er ferdig, så lenge det ikke finnes `preRoundTickets` for neste runde.

### 6. `c9b4d854` — Board mark clearing med bet-state (13:06)
**Filer:** `Theme1GameShell.tsx`, `global.css`

Hva ble gjort:
- `Theme1GameShell.tsx`: La til state `boardMarksPreservedForRoundId` som tracker når markeringer "overlever" en runde.
- `shouldClearBoardMarks` memo:
  - Med innsats (`isBetArmed`): clear 3 sek før neste runde
  - Uten innsats: behold gjennom neste runde, clear ved runden etter
- `playfieldBoards` memo: Mapper alle celler til `tone: "idle"` og fjerner `completedPatterns` når clearing er aktiv.
- Sender `playfieldBoards` i stedet for `snapshot.boards` til `Theme1Playfield`.
- `global.css` linje ~3577: La til `transition: background 0.5s ease, box-shadow 0.5s ease;` på `.board__cell-surface` for fade-effekt.

Hvorfor: Spillere som vant ville sjekke bongene etter runden. Uten innsats beholdes markeringer en ekstra runde.

### 7. `b0b3f3dc` — Draw protection (13:18)
**Filer:** `theme1LiveSync.ts`, `useTheme1Store.ts`

Hva ble gjort:
- `theme1LiveSync.ts`: La til `drawPresentationActiveUntilMs: number` i `Theme1LiveRuntimeState` interface.
- `useTheme1Store.ts` — initialisering: Satt `drawPresentationActiveUntilMs: 0` i alle runtime-state initialiseringer (3 steder).
- `applyPendingDrawPresentation` (~linje 1875): Setter `drawPresentationActiveUntilMs: Date.now() + 3900` (1600ms maskin + 2300ms flight).
- `applyLiveSnapshot` (~linje 1198-1209): Sjekker `isDrawAnimating = runtime.drawPresentationActiveUntilMs > Date.now()`. Under aktiv animasjon: holder `recentBalls` fra current state under `room:update`.
- Ball rail guard (~linje 1189-1196): Endret fra `return clientBalls` til merge — `missingFromClient = serverBalls.filter(b => !clientSet.has(b))`, append til client-liste.

Hvorfor: `room:update` (som kom ~100ms etter `draw:new`) overskrev ball-state og forårsaket blink/duplikater.

### 8. `f20f3902` — Fix marking i applyLiveSnapshot (13:31)
**Fil:** `useTheme1Store.ts`

Hva ble gjort:
- `applyLiveSnapshot` (~linje 1134-1140): Fjernet `isCurrentPlayerArmed`-sjekken. Endret fra `markBoards: result.ticketSource === "currentGame" && playerIsArmed` tilbake til `markBoards: result.ticketSource === "currentGame"`.

Hvorfor: `armedPlayerIds` tømmes mellom runder. Da ble `playerIsArmed = false` under `room:update` remapping, og markeringer forsvant. Armed-sjekken hører kun hjemme i `applyPendingDrawPresentation` (nye trekninger), ikke i `applyLiveSnapshot` (der server-modellen allerede har korrekte marks).

### 9. `2aca25a8` — Output ball scale-in + draw protection fix (13:44)
**Filer:** `theme1DrawMachine.css`, `useTheme1Store.ts`

Hva ble gjort:
- `theme1DrawMachine.css`: Endret output-ball fra instant visibility til CSS transition:
  - Default: `transform: translate(-50%, -50%) scale(0); opacity: 0;`
  - Ikke hidden: `transform: translate(-50%, -50%) scale(1); opacity: 1;`
  - Transition: `0.35s cubic-bezier(0.34, 1.56, 0.64, 1)` (elastisk overshoot)
  - Fjernet separat `--hidden` opacity rule — nå håndtert av `:not(.--hidden)` selector
- `useTheme1Store.ts` (~linje 1202-1209): Fjernet `featuredBallNumber` og `featuredBallIsPending` fra draw-protection. Kun `recentBalls` beskyttes nå.

Hvorfor: Draw-protection holdt `featuredBallIsPending=true` for lenge, som brøt DrawMachine-komponentens sekvens-deteksjon (`beginPendingSequence` vs `applyStableMachineState`).

**NB: DENNE COMMITEN INNEHOLDER TROLIG BALL-ANIMASJON-BUGGEN.** CSS transition på output-ball kjører samtidig med flying-ball, og `suppressedOutputBallNumber` klarer ikke skjule den i tide pga transition. Se `docs/BALL_ANIMATION_HANDOFF.md`.

---

## Git-referanser

- **PR:** https://github.com/tobias363/bingosystem/pull/63
- **Branch:** `fix/candy-tile-auth-gating`
- **Staging (fungerende ball-animasjon):** `origin/staging`
- **Diff staging vs main:** `git diff origin/main..origin/staging -- candy-web/src/`
