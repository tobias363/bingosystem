# Game 2 (Rocket/Tallspill) & Game 3 (Mønsterbingo) — Backend Audit

**Dato:** 2026-04-18
**Scope:** Backend-logikk-paritet mellom legacy Node-backend og ny `apps/backend` BingoEngine/variantConfig.
**Referanse:** Kun lesing — ingen kode-endringer.

---

## §1 Game 2 (Rocket/Tallspill) — Kjernemekanikker

### 1.1 Ticket-struktur
**Legacy:** `legacy/unity-backend/Helper/bingo.js:996-1012`
- 9 numre per billett (3x3 grid), rekkevidde **1..21**
- Ingen koloner-oppdeling (trekker bare 9 unike fra 1..21)
- `ticketBook` genererer **40 billetter** per spillbok når ticket-purchase-flow kjøres (`GameController.js:456 ticketSize: 40`), spilleren velger inntil **30** av dem (`blindTicketPurchase:548`)
- Bot-spill bruker `ticketSize: +ticketCount` direkte (`GameController.js:621`)

**Ny:** `apps/backend/src/game/ticket.ts`
- `generateDatabingo60Ticket` = 3×5 grid, 1..60. **Helt annen struktur.**
- `generateBingo75Ticket` = 5×5 grid, 1..75 (B/I/N/G/O)
- **Ingen 3x3 / 1..21-generator.**

### 1.2 Ball-trekning & vinner-check
**Legacy:** `Game/Game2/Controllers/GameProcess.js:192-203, 254-317`
- Trekker 1..21, maks 21 baller
- Vinner når **>8 matchede tall på én billett** (dvs. alle 9 cellene = "full 3x3-bingo")
- Starter vinner-sjekk **etter 9 baller** trukket
- Ingen linje-claim — kun "full plate"-claim

**Ny:** `BingoEngine.ts`
- Bruker `makeShuffledBallBag(60 | 75)` — **ikke 21**
- `findFirstCompleteLinePatternIndex` + `hasFullBingo` opererer på 3×5 eller 5×5 grid
- **Kan ikke brukes direkte for Game 2's 3x3 / 1..21-format.**

### 1.3 Lucky Number
**Legacy:** `Game/Game2/Controllers/GameController.js:1013-1090`, `gamehelper/game2.js:1628-1712`
- Spiller setter tall mellom 1 og 21 før spillet starter (`luckyNumber <= 0 || > 21`)
- Bonus utbetales hvis siste trukkede ball = spillerens luckyNumber OG spilleren vant
- Bonus-amount er `luckyNumberPrize` satt per sub-spill i admin
- Validering: ikke mulig å endre etter `Sys.StartedGame.includes(game._id)`

**Ny:** `gameEvents.ts:808-824` (`lucky:set`)
- Har en `lucky:set`-event som lagrer `luckyNumber` i-memory (`luckyNumbersByRoom`)
- Validerer 1..60 (**ikke 1..21**)
- **Ingen prize-utbetaling ved match** — bare lagring og broadcast
- `variantConfig.ts:57` har feltet `luckyNumberPrize` definert, men **ingen utbetalings-logikk** som leser det

### 1.4 Jackpot-numbers (Game 2-spesifikk)
**Legacy:** `gamehelper/game2.js:1466-1625`
- `jackPotNumber` = objekt som mapper trekk-nummer (f.eks. 9, 10, 11, 12, 13, 1421) → `{ price, isCash }`
- Utbetaling trigges ved **total antall trekk** (ikke ballverdi):
  - Ved draw #9 vinner du "9-ball bingo"-prize (typisk høyest)
  - Ved "1421" (draws 14-21) vinner du "gain"-prize
- `isCash: true` = fast beløp, `isCash: false` = prosent av (tickets × ticketPrice)
- Definert i `createGame2JackpotDefinition(subGame)` (Common/Controllers)

**Ny:** `variantConfig.ts:58-66`
- Definerer bare **én** jackpot med `drawThreshold: number` og `prize: number` — ikke per-draw-mapping
- Designet for "Full House within N balls" (G1-paradigme), **ikke** G2s per-draw-table
- Ingen kode som leser dette feltet i `BingoEngine.ts`

### 1.5 Ticket-prising
**Legacy:** `GameController.js:459, 628` — én ticketPrice per sub-spill. Spiller kjøper N billetter; totalPrice = N × ticketPrice.
**Ny:** `BingoEngine.ts` — `entryFee` per spiller per runde. **Konsepthold matcher**, men legacy bruker `priceMultiplier` for Large/Elvis (`variantConfig.ts:27`) — Game 2 bruker bare flat price.

### 1.6 Blind ticket purchase
**Legacy:** `GameController.js:528-672` — tilfeldig valg av N billetter fra 40-pakken, autoPlay=false
**Ny:** **Ingen ekvivalent.** `ticket:replace` (`gameEvents.ts:674`) erstatter én billett, men det finnes ikke "pick N random from a pre-generated pool of 40".

### 1.7 Autoplay / Select lucky number
**Legacy:** `SelectLuckyNumber`, `SelectRouletteAuto` (se sockets/game2.js:94) + `handleAutoPlay` i `gamehelper/game2.js:791`
- `autoPlay = true` → spiller deltar automatisk i neste sub-spill med samme selection
**Ny:** Ingen autoplay-flow.

### 1.8 Wallet-flow
**Legacy:** `gamehelper/game2.js:104 adjustPlayerBalance` + `createTransactionPlayer` — debit ved kjøp, credit ved gevinst. Bruker legacy Mongo-basert wallet.
**Ny:** `WalletAdapter.ts` via `BingoEngine.ts:startGame()` — arm = debit, payout = credit. **Konseptet matcher**, men flow er helt annerledes.

### 1.9 Sub-game sequence & rocket-launch
**Legacy:** `GameProcess.js:700-863 StartGameCheck` — flere sub-spill per parentGame, sekvensielt med `gameNumber: CH_1_..._G2`, emit `Game2RocketLaunch`, `StartTimer`
**Ny:** Ingen konsept av "sub-games per runde" eller "rocket launch". Rom er monolittisk.

---

## §2 Game 3 (Mønsterbingo) — Kjernemekanikker

### 2.1 Ticket-struktur
**Legacy:** `Helper/bingo.js:1014-1032` — 5×5 grid, B/I/N/G/O-kolonner 1..75
**Ny:** `ticket.ts:43 generateBingo75Ticket` — **matcher nøyaktig**

### 2.2 Pattern-system — runtime-konfigurerbart per sub-game
**Legacy:** `Game/Common/Controllers/GameController.js:449-473, createChildGame` og `gamehelper/game3.js:295-323 preparePatternData` + `gamehelper/game3.js:724-848 evaluatePatternsAndUpdateGameData`
- Admin definerer `patternGroupNumberPrize[0].PatternData` per sub-game
- Hver pattern har: `patternId, patternName, patternType (25-cell bitmap som string), ballNumber (threshold), prize, prize1 (jackpot), isPatternWin`
- **"Fixed patterns"**: `Row 1..4` er hardkodet; alt annet (bitmask) er **custom pattern fra admin-UI**
- `ballNumber` = minimum antall balls trukket før pattern blir aktiv — hvis overskredet uten winner, patternet fjernes/blir dead
- `winningType: "percent" | "fixed"` styrer om prize er % av pool eller fast beløp
- `prize1` (jackpot-variant): hvis pattern ikke vunnet innen ballNumber → vises jackpot-tall før det fjernes
- `patternDataList`: 2D-array 5×5 av 0/1 som indikerer celler som må fylles
- Sortert etter antall 1-celler (rader først, deretter mer komplekse mønstre) — `GameController.js:451-460`

**Ny:** `variantConfig.ts:36-47 PatternConfig` + `types.ts:9-19 PatternDefinition`
- Har `patternDataList?: number[]` (25-bitmask)
- Har `design: number` (1-4 for rader)
- Har `claimType: "LINE" | "BINGO"` og `prizePercent`
- **Mangler:**
  - `ballNumber` threshold (kritisk — pattern skal deaktiveres etter trekk X uten winner)
  - `prize1` / jackpot-alternativ pris
  - `winningType` (fixed vs percent på pattern-nivå)
  - `isPatternWin`-state som kan rulles gjennom `evaluatePatternsAndUpdateGameData`
- Feltnavn forskjellig: `prizePercent` vs legacy `prize` / `prize1`
- **Ingen runtime evaluering/rotering av hvilke mønstre som er aktive**

### 2.3 Pattern-claim-flow
**Legacy:** `GameProcess.js:215-369 checkForWinners` — **auto-claim** ved hver trekk etter 4 baller:
- Iterer gjennom alle billetter × alle aktive mønstre
- `winningCombinations[patternName]` pre-beregnet per billett ved generering (liste av liste av ball-kombos som gir pattern-win)
- Hvis en av combinations har alle tall trukket → automatisk vinner
- Ingen "claim-submit" fra spiller — fullt automatisk

**Ny:** `BingoEngine.ts claim:submit` (gameEvents.ts:719) — **manuell claim fra spiller**:
- Spiller trykker Bingo-knapp
- Engine evaluerer kun på claim-tidspunkt
- `findFirstCompleteLinePatternIndex` / `hasFullBingo` støtter bare rad/full-plate
- **Ingen støtte for custom 25-bitmask matching**
- **Ingen pre-beregnede `winningCombinations` per billett**

### 2.4 Pattern-cycling / rotation
**Legacy:** `gamehelper/game3.js:724-848 evaluatePatternsAndUpdateGameData`
- Kjøres etter hver ball
- Fjerner mønstre som er vunnet (`isPatternWin === "true"`) eller de hvor `ballNumber < count` og ingen har vunnet
- Første tilgjengelige rad (`Row 1..4`) er "current row" som matches; de andre radene venter på at første blir vunnet
- Broadcast `PatternChange` event med oppdatert liste til klientene
- Håndterer også "jackpot drawn but not won" → jackpot fjernes og isDisplay=false

**Ny:** **Ingen ekvivalent logikk.** Mønstre er statiske for hele runden.

### 2.5 Multiple winners per pattern
**Legacy:** `GameProcess.js:269-275, 343-361` — `samePatterWinIds` array: alle ticketIds som samtidig vinner samme pattern → prize deles likt
**Ny:** Ikke implementert — `lineWinnerId` / `bingoWinnerId` er singulære.

### 2.6 patternWinnerHistory
**Legacy:** `GameProcess.js:354-361` — bygger historikk over alle pattern-winnere gjennom runden; brukes for refund-logikk hvis spillet må avbrytes
**Ny:** `patternResults: PatternResult[]` finnes (`types.ts:119`) men ikke utnyttet samme måte.

### 2.7 Lucky Number (også i Game 3!)
**Legacy:** `Game3/Sockets/game3.js:92 SelectLuckyNumber` + `gamehelper/game3.js:890` (samme flow som G2 — krediteres hvis lastBall === luckyNumber ved vinn)
**Ny:** Samme gap som §1.3.

---

## §3 Delt kode i `Game/Common/`

`Common/Controllers/GameController.js` (2110 linjer) inneholder delt kode:

| Funksjon | Linje | Brukt av |
|---|---|---|
| `startGameCron` | 39 | Alle spill (cron-jobb for å starte games) |
| `sendGameStartNotifications` | 100 | Alle spill (notifications 5/10 min før start) |
| `hallList` | 143 | Common — henter haller |
| `clearRoomsSockets` | 208 | Alle spill (disconnect cleanup) |
| `getGameTypeList` | 275 | Common (lobby) |
| `fixedPatternType` | 325 | Game 3 kun |
| **`createChildGame`** | **334** | **Game 2 + Game 3** (sub-game sequence creation) |
| `createGame1FromSchedule` | 524 | Game 1 kun |
| `availableGameTypes` | 723 | Common |
| `closeDayValidation` | 1120 | Alle |
| `isHallClosed` | 1141 | Alle |

**`PlayerController.js` (6209 linjer)** — delt player-logikk som håndterer break-time, refund, isolation, authentication — ikke spill-spesifikk, men sterkt integrert med Mongo-schemaet og Redis.

**`Common/Services/GameServices.js`** — delt CRUD for parent/child games, halls, generiske updateQueries.

**`Common/Sockets/common.js` (669 linjer)** — felles socket-handlers: room-handling, hall management.

**Delt ny backend har:** `BingoEngine` (monolittisk), `ComplianceManager`, `PayoutAuditTrail`, `PrizePolicyManager`. Konseptuelt dekker break-time/RG via ComplianceManager.

---

## §4 Gap-analyse

### Game 2

| Mekanikk | Legacy (fil:linje) | Ny dekning | Status |
|---|---|---|---|
| 3x3 ticket 1..21 | `Helper/bingo.js:996-1012` | Kun 3×5 (1..60) og 5×5 (1..75) | **MANGLER** |
| 21-ball drawbag | `GameProcess.js:167 getAvailableBalls(..., 21)` | `makeShuffledBallBag(60|75)` | **MANGLER** |
| 9-matched → full-win | `GameProcess.js:288 matched.length > 8` | `hasFullBingo` (hele grid) | **DELVIS** (semantikken finnes, men ikke på 3x3) |
| Lucky Number prize | `gamehelper/game2.js:1628-1712` | `lucky:set` lagrer, ingen payout | **DELVIS** |
| Jackpot-number-tabell | `gamehelper/game2.js:1466-1625` | Bare én `jackpot.drawThreshold` i variantConfig | **MANGLER** |
| `Game2BuyBlindTickets` | `GameController.js:528-672` | Ingen random-pick-fra-pool | **MANGLER** |
| `SelectRouletteAuto` / autoPlay | `gamehelper/game2.js:791` | Ingen autoplay-flow | **MANGLER** |
| `Game2RocketLaunch` event | `GameProcess.js:758` | Ingen tilsvarende event | **MANGLER** |
| Sub-game sequence (CH_N) | `GameProcess.js:651-664` | Monolittisk rom-modell | **MANGLER** |
| `StartTimer` (countdown før draw) | `GameProcess.js:840` | Ingen pre-draw countdown i engine | **MANGLER** |
| Wallet debit/credit | `adjustPlayerBalance` | `WalletAdapter` | **OK** (annen flow, samme konsept) |
| Hall block (Spillvett) | `isPlayerBlockedFromGame` | `ComplianceManager` | **OK** |

### Game 3

| Mekanikk | Legacy (fil:linje) | Ny dekning | Status |
|---|---|---|---|
| 5×5 ticket 1..75 | `Helper/bingo.js:1014-1032` | `generateBingo75Ticket` | **OK** |
| 75-ball drawbag | `GameProcess.js:90 getAvailableBalls(..., 75)` | `makeShuffledBallBag(75)` | **OK** |
| Pattern-custom (25-bitmask) | `gamehelper/game3.js:724-848` | Felt finnes (`patternDataList`), ingen matching | **DELVIS** |
| Pattern `ballNumber` threshold | `gamehelper/game3.js:749-810` | Ikke støttet | **MANGLER** |
| Pattern `prize1` (jackpot-alt pris) | `gamehelper/game3.js:219-223` | Kun én jackpot-global | **MANGLER** |
| `winningType: percent/fixed` | `gamehelper/game3.js:200-202` | Kun `prizePercent` | **DELVIS** |
| Auto-claim ved hver ball | `GameProcess.js:215-369` | Manuell `claim:submit` | **MANGLER** |
| `winningCombinations` pre-kalkulering | Forutsetning for auto-claim | Ingen | **MANGLER** |
| `evaluatePatternsAndUpdateGameData` (pattern cycling) | `gamehelper/game3.js:724-848` | Statiske patterns for runden | **MANGLER** |
| `PatternChange` broadcast | `gamehelper/game3.js:828` | Ingen | **MANGLER** |
| Multi-winner per pattern (samePatterWinIds) | `GameProcess.js:269-275` | Singular `lineWinnerId` | **MANGLER** |
| `patternWinnerHistory` | `GameProcess.js:354` | `patternResults` (begrenset) | **DELVIS** |
| Lucky Number prize | `gamehelper/game3.js:890+` | `lucky:set` uten payout | **DELVIS** |
| Sub-game sequence | `Common/GameController.js:449-473` | Ingen | **MANGLER** |
| Admin pattern-definition UI / schema | `patternGroupNumberPrize` på parentGame | Ikke portert | **MANGLER** |

### Delt

| Mekanikk | Legacy | Ny | Status |
|---|---|---|---|
| createChildGame (multi-sub-game) | `Common/Controllers/GameController.js:334` | Ingen | **MANGLER** |
| `startGameCron` (auto-start fra schedule) | `Common/Controllers/GameController.js:39` | Schedule-system finnes i PlatformService | **DELVIS** (trigger-flow uklar) |
| Player break-time / Spillvett | `Common/Controllers/PlayerController.js` | `ComplianceManager` | **OK** |
| Chat (sendGameChat/History) | `Common/.../ChatServices` | `chat:send`, `chat:history` | **OK** (BIN-516) |
| Socket-events (Game2Room, SubscribeRoom, Game2Ticket, CancelTicket, …) | `Sockets/game2.js` | `room:join`, `room:state`, `ticket:replace`, osv. | **OK** (konseptuelt dekket av BIN-585) |

---

## §5 Estimat

### Game 2 — Nye komponenter som må bygges

| Item | Implementasjon | Avhengigheter |
|---|---|---|
| 1. 3x3 / 1..21 ticket-generator + grid-struktur | 6-8 t | Utvide `ticket.ts`, ny `Ticket.variant: "3x3-21"` |
| 2. 21-ball drawbag-variant i BingoEngine | 3-4 t | Parametrisere `maxBalls` per slug |
| 3. "FullTicket" (9-of-9) winner predicate | 2-3 t | Legg til `hasFull3x3(ticket, marks)` |
| 4. Game 2 Jackpot-number-table + payout | 10-14 t | Ny prize-tabell i variantConfig, ny payout-logikk i engine |
| 5. Lucky Number prize-utbetaling | 4-6 t | Koble `luckyNumbersByRoom` → payout-flow i claim/end |
| 6. Blind ticket purchase (random N of 40) | 4-6 t | Ny `bet:arm`-variant med pool-struktur |
| 7. Autoplay / "bli med i neste runde" | 8-12 t | Ny state-maskin for autoplay (mellom-runde-persistens) |
| 8. Sub-game sequence (CH_N) | 16-24 t | Ny `round`-abstraksjon, schedule-integrasjon |
| 9. `Game2RocketLaunch` + `StartTimer` events | 3-4 t | Nye broadcast-events |

**Game 2 totalt:** **~56-81 timer ≈ 7-10 arbeidsdager**

### Game 3 — Nye komponenter

| Item | Implementasjon | Avhengigheter |
|---|---|---|
| 1. Custom pattern matching (25-bitmask auto-claim) | 10-14 t | Utvide `findFirstCompleteLinePatternIndex`, nytt prediacate |
| 2. Pattern `ballNumber` threshold + cycling | 12-16 t | Ny `evaluatePatterns`-metode i engine etter hver draw |
| 3. Pattern `prize1` (jackpot-alt pris innen ballNumber) | 6-8 t | Utvide PatternConfig + payout-logikk |
| 4. `winningType: fixed` vs percent | 4-6 t | Prize calculation variant |
| 5. Auto-claim (fjerne manuell `claim:submit`) | 8-12 t | Ny event `pattern:auto-won` + state-updates |
| 6. `winningCombinations` pre-kalkulering per billett | 8-10 t | Ticket-generation-side; performance-kritisk |
| 7. Multi-winner split (samePatterWinIds) | 4-6 t | PatternResult-struktur utvidelse |
| 8. `PatternChange` broadcast + current-pattern-state | 3-4 t | Nytt event, ny state |
| 9. Lucky Number prize (same as G2) | Delt (allerede talt i G2 #5) | — |
| 10. Admin pattern-definition UI/schema | 12-16 t | DB-schema for patterns, admin-CRUD |
| 11. Sub-game sequence (samme som G2 #8) | Delt med G2 | — |

**Game 3 totalt:** **~67-92 timer ≈ 8-12 arbeidsdager**

### Felles infra (må gjøres én gang)
- Sub-game sequence (§G2 #8 og §G3 #11) = **16-24 t** (delt)
- `createChildGame` port til PostgreSQL/ny platformservice = **12-16 t**
- Lucky Number prize pipeline (§G2 #5, §G3 #9) = **4-6 t** (delt)

---

## §6 Anbefaling

### Totalt estimat
- **Game 2 eksklusiv (sans delte items 5, 8):** ~44-61 t ≈ 5.5-7.5 dager
- **Game 3 eksklusiv (sans delte):** ~55-76 t ≈ 7-9.5 dager
- **Delte items (sub-game sequence, child-game, lucky prize):** ~32-46 t ≈ 4-6 dager
- **Total backend-paritet G2+G3:** **~130-180 timer ≈ 16-22 arbeidsdager (ca. 3-4.5 uker)**

### PR-strategi — anbefales SPLITTET
Backend-endringene er for store og for forskjellige til én PR. Foreslått splitt:

1. **PR-A: Delt infra** (3-5 dager)
   - Sub-game sequence / `createChildGame` port
   - Lucky Number prize pipeline
   - Pattern-evaluering-hooks i engine (uten å implementere full logikken ennå)

2. **PR-B: Game 2 backend-paritet** (6-8 dager)
   - 3x3 ticket + 21-ball drawbag
   - Jackpot-number-table + payout
   - Blind ticket / autoplay
   - Rocket events

3. **PR-C: Game 3 backend-paritet** (7-10 dager)
   - Custom pattern matching (bitmask)
   - Pattern cycling + ballNumber threshold
   - Auto-claim flow
   - Multi-winner split
   - Admin pattern CRUD

### Kan klient-port på G2/G3 starte parallelt?

**Game 2:** **NEI — bør vente på PR-B.** Klienten trenger kjente socket-events (`Game2RocketLaunch`, `StartTimer`, `WithdrawBingoBall`, `TicketCompleted`, `JackpotListUpdate`, `GameFinish`), kjent ticket-struktur (3×3), kjent lucky-number-contract, og kjent jackpot-prize-tabell-format. Å lage klient mot en backend som ennå ikke har disse konseptene vil føre til dobbelt-arbeid når backend kommer.

**Game 3:** **NEI — bør vente på PR-C.** Klienten må rendere dynamisk pattern-liste som endres under spillet (via `PatternChange`), må vise jackPotData-tall-tracker, må håndtere auto-claim (ingen bingo-knapp). Disse er kjerne-UX — ikke kosmetikk — og krever backend-contract før UI kan låses.

**Men:** Det som **kan starte parallelt** uten risiko:
- Klient-scaffold (routes, Svelte-komponenter, asset-loading)
- Ticket-render-komponent som er agnostic til grid-dimensjon
- Generisk draw-history / chat / break-time-modaler (delt med G1)
- Lobby- og hall-valg-flyt

**Foreslått oppstart:** Start PR-A umiddelbart, parallelt begynn klient-scaffold og generiske komponenter. PR-B kan starte ~dag 3 når PR-A's pattern-hooks er stabile. PR-C kan starte etter PR-A, parallelt med PR-B.

### Risiko-flagger
1. **`winningCombinations` pre-kalkulering** er CPU-intensiv ved ticket-generering for G3; må profileres mot forventet spillerantall.
2. **`createChildGame` port** er stor og berører schedule-systemet — vurder om dette heller skal være eget epic (BIN-???).
3. **Admin pattern-CRUD** for G3 er egentlig et helt produkt-område; kanskje portes med "hardkodede defaults først"-strategi og admin-UI kommer senere.
4. **Pattern matching med 25-bitmask** må valideres mot legacy-tickets hvis vi skal sikre bakover-kompatibilitet med spillere som har eksisterende historikk (trolig ikke relevant for ny backend som starter frisk).

---
