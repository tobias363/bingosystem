# Spill 1 Casino-Grade Code Review — 2026-04-26

**Reviewer:** Senior code reviewer (casino-industry benchmarking).
**Scope:** Hele Spill 1 (game1, slug `bingo`) — backend, game-client, admin-web, shared-types.
**Mål:** Vurdere koden mot best-practice fra Pragmatic Play, Evolution Gaming, NetEnt og IGT.

---

## Executive Summary

Spill 1 har en **solid kjerne** med flere moderne mønstre (idempotency-keys, FOR UPDATE-låser i scheduled-engine, server-derived playerIds, structured logging, prom-metrics). **Men** koden lider av at den er bygget i to faser med **to parallelle "engines"** — den gamle `BingoEngine` (host-player-rom, in-memory state) og den nye `Game1DrawEngineService` (DB-autoritativ, scheduled-games). Begge eksisterer side-om-side i produksjon for Spill 1, og koden migrerer aktivt fra den ene til den andre. Dette skaper konsistens-risiko, duplikat compliance-paths, og en betydelig overflate for subtile bugs.

**Risiko-fordeling:**
- **CRITICAL:** 7 funn (regulatorisk + dual-state-konsistens + manglende prize-cap på pot/mini-game/lucky)
- **HIGH:** 11 funn (atomicity-gaps, manglende compliance-ledger på flere paths, in-memory state uten atomicity)
- **MEDIUM:** 13 funn (observability, performance, code clarity)
- **LOW:** 8 funn (post-pilot polish)

**Pilot-blokkere:** alle 7 CRITICAL pluss 3-4 HIGH må adresseres før første hall går live.

**Sammenligning med casino-industri:** Pragmatic Play / Evolution / NetEnt opererer med en **én-engine, én-state-model** og audit-loggings-paths som er én-til-én med pengeflyten. Spill 1 har duplikat-paths (gamle `BingoEngine.submitClaim` med ledger + ny `Game1DrawEngineService.evaluateAndPayoutPhase` der pot/lucky/mini-game-payouts IKKE skriver til ledger), og to in-memory states (`RoomStateStore` + DB) som kan divergere. Dette ville aldri passert intern review hos en topp-tier casino-leverandør.

---

## Casino Industry Benchmark

### Hvordan måler vi oss mot bransjen?

| Område | Pragmatic Play / Evolution / NetEnt-standard | Spill 1 nåværende state | Score |
|---|---|---|---|
| Server authority | All gameplay-state på server, klient er ren render | Ja, men in-memory state for ad-hoc rom + DB for scheduled-rom **dupliserer** state. Klient er ren render. | 🟡 6/10 |
| RNG | Crypto-secure (crypto.randomInt eller HSM) per draw, audit-trail med seed | `crypto.randomInt` på alle draws + ticket-grids + mini-games. Ingen seed-arkivering for replay. | 🟢 7/10 |
| Wallet atomicity | Alle pengeflyt-operasjoner er én DB-transaksjon med deterministisk idempotency | Kanonisk `IdempotencyKeys`-modul + `runInTransaction`. Men flere paths har wallet-credit UTENFOR den outer transaksjonen — relier på idempotency-key-dedupe ved retry. | 🟡 6/10 |
| Compliance/Audit | Hver pengeflyt skal være sporbar i regulatorisk ledger med korrekt §-merke | Ledger-skriv går fra de viktigste paths (purchase, phase-payout, BingoEngine.submitClaim). Men: alle ledger-writes hardkoder `gameType: "DATABINGO"` (Spill 1 = hovedspill = MAIN_GAME, ikke databingo). Pot/lucky/mini-game-payouts skriver IKKE til ledger. | 🔴 3/10 |
| Replay/dispute | Determinisk seed + event-stream gjør at en runde kan replays for tvist | Audit-events finnes, men ingen seed-arkivering. Replay må rekonstrueres fra event-rekkefølge alene. | 🟡 5/10 |
| Concurrency | Alle race-vinduer låst med FOR UPDATE eller Redis-lock | Scheduled-engine bruker FOR UPDATE solid. Ad-hoc engine bruker mutex via in-process state. JobScheduler-locks dekker auto-draw. Mini-game-credit + UPDATE har split-tx. | 🟡 6/10 |
| Disaster recovery | Crash mid-runde gjenoppretter til siste komittert state, klient resync | Solide checkpoint + `Game1RecoveryService` for orphans, men etter master-control commit flopper engine-init og status='running' uten engine-state — ingen rollback. | 🟡 6/10 |
| Stuck-detection | Watchdog-monitoring + auto-recovery for hung rounds | Watchdog finnes for ad-hoc, men scheduled-engine har INGEN stuck-detection. Render-instances kan henge spill i 'running' uten at noen merker det. | 🔴 4/10 |
| Test coverage | 80%+ unit, integration tests for race conditions, compliance suites | 100+ test-filer, multi-winner + crash-recovery tester finnes. Men tester verifiserer atferd, ikke regulatorisk korrekthet (gameType-bug ble ikke fanget av eksisterende tester). | 🟡 6/10 |
| Code clarity | Én klar mental modell, ingen lapping | Massive comments forklarer hver lapp. `BingoEngine.ts` er 3109 linjer med ~14 forskjellige PR-merker som lever side-om-side. | 🔴 4/10 |
| Anti-cheat | Klient kan ikke spoofe events, alle inputs Zod-validert | playerId server-derived ✅, Zod-schemas på socket events ✅, rate-limiting per-event ✅. Solid. | 🟢 8/10 |

**Total bransje-modenhet:** 5.6/10 — middels. Solide enkelt-deler, men dual-engine-overgangen drar ned snittet.

---

## Findings by Risk Level

### CRITICAL (pilot-blokkere)

#### CRIT-1: ALLE Spill 1 ledger-writes bruker feil `gameType` — regulatorisk feil
**Fil:** `apps/backend/src/game/Game1TicketPurchaseService.ts:492`, `apps/backend/src/game/Game1PayoutService.ts:330,368`, `apps/backend/src/game/BingoEngine.ts:735,1259,1268,1579,1759,1777,1882,2306,2330`

Per `docs/architecture/SPILLKATALOG.md` (PM-låst 2026-04-25): Spill 1 er **hovedspill** (`MAIN_GAME`, 15% til organisasjoner), ikke databingo (30%). Likevel hardkoder **alle** Spill 1 ledger-writes `gameType: "DATABINGO"`. Dette gjelder 12+ call-sites og fører til at:

- §11-prosent-implementering i `ComplianceLedgerOverskudd.ts:75` (som bruker `row.gameType === "DATABINGO" ? 0.3 : 0.15`) sender 30% til organisasjoner i stedet for 15% — eller motsatt.
- §71 daily reports per game-type splittes feil — Spill 1-omsetning legges sammen med SpinnGo (databingo) som har ulike krav.
- Lotteritilsynet-revisjon vil avdekke dette på dag 1.

Recommended fix: introduser per-spill `LedgerGameType`-resolver (DI-injeksjon). Spill 1 (`bingo`-slug) returnerer `MAIN_GAME`. SpinnGo (`spillorama`-slug) returnerer `DATABINGO`. Ingen call-site skal hardkode.

**Estimat:** 2 dev-dager (12+ call-sites + tester). **Pilot-blokker:** Ja.

#### CRIT-2: Pot, Lucky Bonus og Mini-Game payouts skriver IKKE til ComplianceLedger
**Fil:** `apps/backend/src/game/pot/PotEvaluator.ts`, `apps/backend/src/game/Game1LuckyBonusService.ts`, `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.ts:662-681`, `apps/backend/src/game/Game1DrawEngineService.ts:2046-2083`

`Game1PayoutService.payoutPhase` skriver `PRIZE`/`EXTRA_PRIZE` til ledger (linje 326-398) — bra. Men:
- Mini-game-payouts (`Game1MiniGameOrchestrator.creditPayout`, linje 662-681) gjør kun `walletAdapter.credit` uten ledger-entry.
- Pot-utbetalinger (Innsatsen + Jackpott via `runAccumulatingPotEvaluation`) krediterer wallet uten ledger-entry.
- Lucky Number Bonus (`payoutLuckyBonusForFullHouseWinners`) kreder bonus uten ledger-entry.

**Konsekvens:** §71 daily reports under-rapporterer prize-utgifter med 5-30% (avhenger av hvor stor andel pot/mini-game/lucky utgjør). Lotteritilsynet får et tall som ikke matcher faktisk wallet-flyt — direkte revisjons-funn.

Recommended fix: Hver payout-path skal kalle `complianceLedgerPort.recordComplianceLedgerEvent` med `eventType: "EXTRA_PRIZE"` (eller ny `BONUS_PRIZE` for lucky).

**Estimat:** 1.5 dev-dager. **Pilot-blokker:** Ja.

#### CRIT-3: Ingen single-prize cap (2500 kr) på pot/mini-game/lucky payouts
**Fil:** `apps/backend/src/game/pot/PotEvaluator.ts`, `apps/backend/src/game/Game1LuckyBonusService.ts`, `apps/backend/src/game/minigames/MiniGameWheelEngine.ts`, `apps/backend/src/game/minigames/MiniGameChestEngine.ts`

Pengespillforskriften setter **2500 kr som maks enkeltpremie** for hovedspill. `BingoEngine.submitClaim` håndhever dette via `prizePolicy.applySinglePrizeCap` (linje 1775-1779, 1880-1884). Men i den nye scheduled-game-pathen finnes ingen tilsvarende cap. Konsekvens:

- `Jackpott`-pot kan akkumulere til 30 000 kr (`JACKPOT_DEFAULT_MAX_CAP_CENTS`, Game1JackpotStateService.ts:42) og utbetales i sin helhet — ulovlig.
- Wheel-mini-game har default 4000 kr per bucket (`DEFAULT_WHEEL_CONFIG`), Chest har default 4000 kr — over capen.
- Lucky bonus konfigureres per sub-game uten øvre grense.

Recommended fix: før `walletAdapter.credit` i hver payout-path, kall `prizePolicy.applySinglePrizeCap({hallId, gameType: "MAIN_GAME", amount})` og bruk `cappedAmount`. Audit-logg den manglende delen som `houseRetained`.

**Estimat:** 1 dev-dag. **Pilot-blokker:** Ja (regulatorisk risiko).

#### CRIT-4: Dual engine for Spill 1 — risiko for state-divergens
**Fil:** `apps/backend/src/sockets/game1ScheduledEvents.ts:178-254`, `apps/backend/src/game/BingoEngine.ts:593-679`, `apps/backend/src/game/Game1DrawEngineService.ts:893-1268`

`game1:join-scheduled` lager **både** en in-memory `BingoEngine.RoomState` (med spillere, draw-bag, ticket-grids, marks) **og** en DB-rad i `app_game1_game_state` (egen draw-bag, tickets via `app_game1_ticket_assignments`). For ad-hoc Spill 1 (rare) er BingoEngine autoritativ; for scheduled Spill 1 (vanlig) er Game1DrawEngineService autoritativ. Ingen guard hindrer at:

- En klient sender `draw:next` (ad-hoc path) på et scheduled-rom — det kaller `engine.drawNextNumber` som muterer in-memory `RoomState.drawnNumbers` og krediterer wallet via `BingoEngine.submitClaim`. **Resultat:** spillere ser draws både fra DB-engine og in-memory-engine, mens scheduled DB-state ikke vet om dem.
- En klient sender `claim:submit` på et scheduled-rom mens Game1DrawEngineService allerede har auto-betalt phase via `evaluateAndPayoutPhase`. Begge skriver wallet credits. Idempotency-key-systemet redder oss IKKE her fordi keyene er forskjellige (`g1-phase-…` vs `line-prize-…`).

`docs/architecture/SPILL1_ENGINE_ROLES_2026-04-23.md` dokumenterer at "BingoEngine.startGame/drawNextNumber/evaluateActivePhase kalles aldri for scheduled Spill 1", men **det er ingen runtime-guard** som håndhever dette. Et bug-fix der det glipper, eller en pen-tester som spammer endpoints, kan trigge dual-payout.

Recommended fix: sjekk `room.gameSlug + isScheduled` og kast `DomainError("USE_SCHEDULED_API")` for alle BingoEngine-mutasjoner på scheduled-rom. Se også HIGH-1.

**Estimat:** 1.5 dev-dager. **Pilot-blokker:** Ja.

#### CRIT-5: Wallet credit i mini-game-orchestrator skjer i separat transaksjon — partial-failure-vindu
**Fil:** `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.ts:456-477`

```typescript
// I outer runInTransaction:
if (result.payoutCents > 0) {
  await this.creditPayout(context, miniGameType, result.payoutCents);  // bruker EGEN tx
}
await client.query(`UPDATE ...result_json...completed_at = now() WHERE id = $1`, ...);
```

`walletAdapter.credit` bruker en separat DB-transaksjon (ikke samme `client`). Hvis credit-en commit-er men UPDATE feiler (DB-connection drop, lock timeout), så er pengene betalt ut, men `completed_at` er fortsatt NULL. Neste retry vil:

1. `lockResultRow` finner raden (completed_at IS NULL).
2. `handleChoice` kjører på nytt — kan returnere ulik `result.payoutCents` siden RNG er kalt på nytt.
3. `creditPayout` kalles med samme `idempotencyKey: g1-minigame-${resultId}` → walletAdapter dedupliserer ✅.
4. UPDATE setter completed_at + nye result_json.

Selv om idempotency-keyen redder pengeflyten, så **avviker det som er logget i `app_game1_mini_game_results` fra det som faktisk er kreditert** (fordi RNG ble kalt på nytt og loggboken viser siste resultat, men payout hadde første resultat). Dette er en regulatorisk audit-issue.

Recommended fix: Flytt walletAdapter.credit inn i samme `client`-transaksjon. Dvs. eksponer en `creditWithClient(client, ...)`-variant på WalletAdapter, eller skriv en pending `payout_cents` til DB FØR credit, og match den ved retry.

**Estimat:** 1 dev-dag. **Pilot-blokker:** Ja (audit-trail integrity).

#### CRIT-6: BingoEngine.submitClaim har ingen tx-wrapping for wallet+ledger+compliance
**Fil:** `apps/backend/src/game/BingoEngine.ts:1647-1989`

`submitClaim` muterer `game.bingoWinnerId`, `game.lineWinnerId`, `game.patternResults`, kaller `walletAdapter.transfer`, `compliance.recordLossEntry`, `ledger.recordComplianceLedgerEvent`, `payoutAudit.appendPayoutAuditEvent`, `rooms.persist`. Hvis transfer feiler etter at `game.lineWinnerId` er satt (line 1764), så er state-en korrupt: spilleren ser seg selv som vinner, men har ikke fått pengene. Hvis `rooms.persist` feiler etter transfer, er state borte ved restart men pengene er betalt. Disse er separate I/O-paths uten transaksjonell konsistens.

I Pragmatic Play / Evolution er dette mønsteret: **alle I/O i en claim går gjennom én outer transaction-coordinator** som kaller compensating actions ved partial failure. Spill 1 har ingen slik orkestrering — det er en sekvens av `await`-kall.

Recommended fix: lag `submitClaimAtomic(claim) -> {client, transfer, ledgerEntry, auditEntry}` som er én transaksjon. Den nye Game1DrawEngineService gjør dette riktigere med `runInTransaction(client => …)` der alt går i samme client.

**Estimat:** 2 dev-dager. **Pilot-blokker:** Ja (men kan delvis mitigeres ved at scheduled-engine er primær path).

#### CRIT-7: Master-control commit-er DB-state før engine.startGame — partial-state-vindu
**Fil:** `apps/backend/src/game/Game1MasterControlService.ts:740-749`

```typescript
const result = await this.runInTransaction(async (client) => { ... commit status='running' ... });
// POST-commit:
if (this.drawEngine) {
  await this.drawEngine.startGame(input.gameId, input.actor.userId);
}
```

Master-control committer `scheduled_games.status='running'` i én transaksjon, og *deretter* kaller `drawEngine.startGame`. Hvis engine.startGame feiler (DB-feil, ticket_config-feil), er DB-state-en `status='running'` uten tilhørende `app_game1_game_state`-rad. Auto-draw-tick hopper over (siden den krever game_state-rad), men fra spillernes perspektiv er spillet "running" uten at noe trekkes. Master kan ikke pause (engine kaster fordi det ikke finnes state). Eneste vei ut er manuelt DB-edit.

Recommended fix: gjør hele master.startGame til én transaksjon ved å sende `client` fra master inn i drawEngine.startGame. ELLER: master-control rollback-er til 'ready_to_start' hvis engine-startup feiler.

**Estimat:** 1 dev-dag. **Pilot-blokker:** Ja.

---

### HIGH (pre-GA)

#### HIGH-1: Ingen runtime-guard mot å bruke ad-hoc engine på scheduled-rom
Se CRIT-4. Selv etter at man "lover" at scheduled Spill 1 ikke bruker `engine.drawNextNumber`, finnes ingen kode som kaster hvis det skjer. Defensiv programmering bør guarde alle BingoEngine.mutate-paths med `assertNotScheduled(room)`.

#### HIGH-2: TODO-hook for jackpot-reset etter vinning er aldri implementert
**Fil:** `apps/backend/src/game/Game1JackpotStateService.ts:323-327`

`resetToStart` finnes som metode men er **aldri kalt** fra noen path (verifisert via grep). Det betyr: Jackpott akkumulerer fra 2000 kr → 30 000 kr cap, og når en spiller vinner Fullt Hus innenfor draw-thresholds (50/55/56/57), så betales jackpot ut, men state-en resettes ALDRI. Neste runde har fortsatt 30 000 kr → kan vinnes igjen.

#### HIGH-3: Pot/Lucky/Mini-game-payouts har ingen `payoutAudit.appendPayoutAuditEvent`
**Fil:** Samme som CRIT-2.

`PayoutAuditTrail` er det interne audit-trail-systemet for pengebevegelser. `BingoEngine.submitClaim` skriver til det (linje 1824-1836). Pot/lucky/mini-game-payouts skriver IKKE. Audit-rapporten "Game History" vil mangle disse pengeflowene.

#### HIGH-4: In-memory `RoomStateStore` kan divergere fra DB ved Render-deploy
**Fil:** `apps/backend/src/game/BingoEngine.ts:317-320`, `apps/backend/src/store/RoomStateStore.ts`

Selv med Redis-backed `RedisRoomStateStore`, er det `BingoEngine.rooms`-mapet som er primær lookup. Hvis en Render-instance startes etter krasj, er Redis-state lest, men `currentGame.tickets`-mapet i RAM er ikke garantert konsistent med DB-checkpoint. `BingoEngineRecovery` gjør et best-effort job, men vi har ingen end-to-end "instance restart med 50 spillere" stress-test som beviser konsistens. Dette er en kjent svakhet for ad-hoc Spill 1 (Spill 2/3) — for scheduled Spill 1 reduseres risikoen fordi DB er autoritativ.

#### HIGH-5: Ad-hoc draw rate limit `2s/5draws` per socket, men ingen per-room-lock
**Fil:** `apps/backend/src/middleware/socketRateLimit.ts:23`

Rate-limit sier maks 5 draws per 2s per socket. For ad-hoc Spill 2/3 betyr det at en spammer host-spiller kan trigge 5 draw-events i tett rekkefølge. `BingoEngine.drawNextNumber` har `minDrawIntervalMs` (default 1500), men det er en check i memory uten lock — race-vinduet er åpent for 1ms. To samtidige `draw:next` mot samme rom kan begge passere `assertHost` og deretter call `game.drawBag.shift()` som er en mutex-stille operasjon. Mest sannsynlig fanges av pre-existing assertion `if (game.drawnNumbers.length >= maxDrawsPerRound)`, men det er fragilt.

#### HIGH-6: Multi-winner Fullt Hus split kan tape øre — "house retain" logges men ikke ledger-skrivest
**Fil:** `apps/backend/src/game/Game1PayoutService.ts:204-232`

`prizePerWinnerCents = floor(totalPhasePrizeCents / winnerCount)`. Resten (`houseRetainedCents`) audit-logges via `splitRoundingAudit` men skrives ikke som ledger-entry. Konsekvens: `ComplianceLedger.daily_report.totalStakes - totalPrizes` viser et større tap enn faktisk fordi rest-øren ikke er compensert som houseRetained-event. Auditor kan ikke verifisere at husets margin matcher §11-beregningen.

#### HIGH-7: Game1AutoDrawTickService leser `last_drawn_at` uten lock
**Fil:** `apps/backend/src/game/Game1AutoDrawTickService.ts:165-181`

Tick-service spør `loadRunningGames` uten FOR UPDATE. Den henter snapshot, sjekker om "due", trigger drawNext (som tar FOR UPDATE inne). Hvis to ticks fyrer overlappende (tick 1 fortsatt aktiv, tick 2 starter), vil begge se samme "due"-state. Tick 2 vil få DomainError fra FOR UPDATE-lock-timeout eller race på `state.draws_completed >= drawBag.length`-check. Det er fanget i try/catch og logget som warning, men det forsterker logg-støy under last og kan maskere ekte feil. JobScheduler har Redis-lock, så cross-instance er OK; det er innen-prosess-overlap som er issue.

#### HIGH-8: Ingen circuit-breaker mellom wallet-adapter og DB
**Fil:** `apps/backend/src/adapters/PostgresWalletAdapter.ts`

Hvis Postgres er nede eller hengt, vil hver `walletAdapter.transfer` vente til pool-timeout (typisk 30s) før den feiler. Dette kan føre til at hele runden henger i 30s før den kaster `PAYOUT_WALLET_CREDIT_FAILED` og rollbacker drawNext. Pragmatic Play bruker circuit-breakers (open after 3 consecutive failures, half-open retry) for å fail-fast.

#### HIGH-9: Compliance-loss recordEntry feil → soft-fail kan tillate over-spending
**Fil:** `apps/backend/src/game/Game1TicketPurchaseService.ts:432-440`

```typescript
try {
  await this.complianceLoss.recordLossEntry(buyerWalletId, input.hallId, {type:"BUYIN", amount, ...});
} catch (err) {
  log.warn(...); // soft-fail
}
```

Hvis compliance-tjenesten er nede, blir BUYIN ikke logget. Spilleren kan dermed kjøpe over sin daglige tapsgrense fordi neste compliance-check ser et lavere total enn faktisk. Pengespillforskriften krever fail-closed: hvis compliance-tjenesten ikke kan logge, skal kjøp blokkeres. (Forskjellen mellom "vi krediterer ikke ved feil" og "vi tillater spill ved feil" er stor.)

#### HIGH-10: payoutLuckyBonus mangler RTP-budget-check
**Fil:** `apps/backend/src/game/Game1LuckyBonusService.ts`, `apps/backend/src/game/Game1DrawEngineService.ts:2046-2060`

`BingoEngine.submitClaim` håndhever `game.remainingPayoutBudget` (RTP-cap) og logger `rtpCapped`. Lucky-bonus i scheduled-engine kalkulerer beløp og betaler uten å sjekke om sum (phase-prize + jackpot + bonus) overskrider gjeldende `payoutPercent` budget for runden. Resultat: enkelte runder kan utbetale > 100% av innsats.

#### HIGH-11: ChatPanelV2 — backend logger ikke chat for moderasjon
**Fil:** `apps/backend/src/sockets/gameEvents/chatEvents.ts:62-71`

Chat persisteres til Postgres via `chatMessageStore.insert`, fire-and-forget. Men ingen route eksponerer chat-meldinger til admin-panel for moderasjon (`/api/admin/chat/messages`). For et regulert pengespill bør hall-operator kunne søke i chat for compliance-issues (mobbing, hvitvasking, child-exposure). Mangler.

---

### MEDIUM (nice-to-have for pilot)

#### MED-1: Logger har ingen trace-id / request-id
**Fil:** `apps/backend/src/util/logger.ts`

Pino brukes, men ingen `req.id` eller `correlationId` propageres på tvers av paths. Når en spiller rapporterer "min draw henget", er det praktisk umulig å filtrere logger til den spesifikke runden uten å grep manuelt på `gameId`/`roomCode`.

#### MED-2: Metrics labelnames for `claimSubmitted` mangler `phaseId`
**Fil:** `apps/backend/src/util/metrics.ts:91-95`

`claimSubmitted{game,hall,type}` — mangler hvilken fase som ble vunnet. Histogrammer av "tid fra phase 1 vunnet → phase 2 vunnet" kan ikke beregnes uten phase-label.

#### MED-3: Ingen end-to-end "full runde" test som dekker alle 5 faser + mini-game + lucky
Test-suiten er bred, men det finnes ingen integration-test som starter et scheduled-game, kjøper bonger fra 3 spillere, kjører 52 draws via auto-draw-tick, verifiserer at hver fase har riktig vinner, mini-game trigger på Fullt Hus, payout-summer matcher input-pott, ledger har korrekt antall entries. Hver del er testet isolert, men kombinasjonen er ikke verifisert.

#### MED-4: `BingoEngine.ts` er 3109 linjer
**Fil:** `apps/backend/src/game/BingoEngine.ts`

For sammenligning: Pragmatic Play sin "BaseGameEngine"-klasse er typisk ~600 linjer med klare interfaces til underliggende services. 3109 linjer = uvedlikeholdbart. Mye er flyttet ut (`BingoEngineMiniGames`, `BingoEnginePatternEval`, `BingoEngineRecovery`), men kjernen er fortsatt for stor.

#### MED-5: `Game1DrawEngineService.ts` er 2651 linjer
**Fil:** `apps/backend/src/game/Game1DrawEngineService.ts`

Samme problem. `drawNext`-metoden er ~330 linjer alene (linje 893-1268). Vanlig casino-engine practice: hver public method holder seg under 50 linjer, kompleks logikk delegeres til Phase-spesifikke handlers.

#### MED-6: TS-strict mode er enabled, men noen tester bruker `as any`
Verifisert via grep — kun i tester, ikke i produksjon. Ikke kritisk men bør ryddes.

#### MED-7: `_underscore` private-prefix i CLAUDE.md, men kode bruker `private`-keyword
**Fil:** Hele kodebasen.

CLAUDE.md sier "Private fields: `_underscore` prefix (`this._cache`)". Faktisk kode bruker TS `private`-keyword i klasser uten underscore. Inkonsistens med doc.

#### MED-8: Ingen latency-budget for klient-side animations
**Fil:** `packages/game-client/src/games/game1/components/BallTube.ts`, etc.

WebGL-rendering på Pixi.js har ikke uttalt frame-budget. På lavt-end-mobile (Samsung A5x serien) kan animasjonene fryse under tunge runder. Pragmatic Play har profilert "60 FPS minimum" som kontraktuell SLA.

#### MED-9: Klient kan kjøre `socket.startGame()` men resultatet ignoreres for scheduled-rom
**Fil:** `packages/game-client/src/games/game1/logic/SocketActions.ts:62-68`

`actions.startGame()` kaller `socket.startGame({roomCode})` som triggerer `BingoEngine.startGame` (ad-hoc-engine). For scheduled Spill 1 er dette no-op fordi master-control eier start-flyten — men klient gir ingen indikasjon. UX-forvirring og mulig regulator-issue ("hvorfor kan spillere starte spill?").

#### MED-10: Mini-game-router har ingen error-recovery hvis socket-disconnect midt i mini-game
**Fil:** `packages/game-client/src/games/game1/logic/MiniGameRouter.ts`

Hvis spilleren får mini-game trigger, men disconnect-er før choice sendes, mister vedkommende mini-game-en. Backend `app_game1_mini_game_results.completed_at IS NULL` står igjen. `listPending` finnes, men ingen automatisk re-trigger ved reconnect.

#### MED-11: Pause-overlay viser bare "Spillet er pauset" — ingen estimat på resume-tid
**Fil:** `packages/game-client/src/games/game1/components/PauseOverlay.ts`

Manuelt master-pause kan være 30s-flere minutter. Spillere får ingen kontekst. Standard casino-UX viser "Resuming in 45s" eller "Awaiting hall operator".

#### MED-12: Ingen lighthouse-score / accessibility-audit for spill-klient
For Norge må digitale tjenester følge WCAG 2.1 AA per likestillings- og diskrimineringsloven. Spill-klienten har ikke aria-labels på hovedknapper (verifisert via search).

#### MED-13: `Game1MasterControlService` har 1552 linjer — mange felt-validatorer skulle vært utleid
Validering av actor + hall + ready-status + jackpot-confirm + red-haller + unready-haller + excluded-haller skjer alt i samme `startGame`-funksjon. Burde være en `StartGamePreflight`-pipeline.

---

### LOW (post-pilot polish)

#### LOW-1: Ingen replay-API for tvister
Ingen `GET /api/admin/games/:id/replay` som rekonstruerer event-stream for en runde. Audit-events finnes, men de er ikke lett å bruke for "bevis at spiller X tapte fordi pattern Y ikke matchet".

#### LOW-2: Game1JackpotStateService daily-tick bruker UTC-dag, ikke Norway-dag
**Fil:** `apps/backend/src/game/Game1JackpotStateService.ts:76-79`

`todayUtcKey` tar UTC. I Norge er midnatt UTC = 01:00 (vinter) / 02:00 (sommer). Hvis en runde går over midnatt Norge-tid, akkumulerer jackpott "feil" dag. Trolig akseptabelt for pilot, men ikke industri-standard.

#### LOW-3: `BingoEngine.startGame` har en hardkodet `minRoundIntervalMs` på 30000
**Fil:** `apps/backend/src/game/BingoEngine.ts:392`

`Math.max(30000, …)` betyr at miljø-config kan ikke gå under 30s. For test/staging er dette friksjon.

#### LOW-4: Ingen heartbeat-mekanisme spiller→server
Klienter sender ikke proaktivt "jeg lever". Sokket-disconnect fanges av Socket.IO-heartbeat (default 25s ping). Pragmatic Play bruker eksplisitt application-level ping for å detektere zombie-tilstander raskere.

#### LOW-5: Settings-panel lagrer i localStorage, ikke synket til server
**Fil:** `packages/game-client/src/games/game1/components/SettingsPanel.ts`

Lyd-/visuell-preferanser er lokale per browser. Hvis spilleren bytter device, mister settings.

#### LOW-6: Pixi.js-renderer har ingen explicit memory-limit for assets
Lekkasjer er mulige hvis flere runder uten rensing.

#### LOW-7: Telemetri-endpoint sender ingen data anonymt utenfor systemet
Telemetry.ts er stub. Ingen analytics for produksjon.

#### LOW-8: Store admin-routes har `requirePermission` men ingen RBAC-tabell-doc
Permissions er hardkodet i route-koden. Ingen sentralisert tabell for "hvilken role har hvilken permission".

---

## Findings by Domain

### 1. Server authority

✅ **Solid:** All gameplay-state ligger på server. Klient er ren render. PlayerId server-derived (apps/backend/src/sockets/gameEvents/context.ts:247-263). Lucky-numbers stored i `RoomStateManager`-memory. Mini-game RNG kjøres i backend (`MiniGameWheelEngine.ts:124-126`).

🔴 **Kritisk:** Dual-engine for Spill 1 kan tillate at klient triggerer ad-hoc-path på scheduled-rom (CRIT-4, HIGH-1).

### 2. RNG and audit

✅ **Solid:** `crypto.randomInt` brukes konsekvent (`apps/backend/src/game/ticket.ts:12`, `DrawBagStrategy.ts:33`, `MiniGameWheelEngine.ts:124-126`, `MiniGameChestEngine.ts`). Determinisme er ikke et problem fordi ingen seed-arkivering = hver runde er unik.

🟡 **Mangler:** Ingen seed-arkivering for replay. Hvis Lotteritilsynet krever bevis for at runde X var fair, må vi rekonstruere fra event-stream (mulig men tungvint). Pragmatic Play arkiverer crypto-seed per runde.

🟡 **Mangler:** Ingen RNG-cert. CLAUDE.md sier "no external RNG cert needed", som er korrekt for norsk lovgivning, men selv intern audit krever loggføring av RNG-implementasjon-version per runde for å bevise endringer ikke skjedde mid-pilot.

### 3. Wallet atomicity

✅ **Solid:** `IdempotencyKeys`-modul er kanonisk og veldokumentert (`apps/backend/src/game/idempotency.ts`). PostgresWalletAdapter bruker `BEGIN/COMMIT/ROLLBACK` korrekt. Wallet-split (deposit/winnings) implementeres med winnings-first-policy.

🔴 **Kritisk:** Mini-game payout har split-tx (CRIT-5).

🔴 **Kritisk:** BingoEngine.submitClaim har ingen outer transaction (CRIT-6).

🟡 **Bekymring:** Ingen explicit isolation level set. Defaulter til READ COMMITTED i Postgres (Pragmatic Play setter SERIALIZABLE for wallet-ops for å fange phantom-reads).

### 4. Compliance

🔴 **Kritisk:** Hardkodet `gameType: "DATABINGO"` overalt (CRIT-1).

🔴 **Kritisk:** Pot/lucky/mini-game IKKE i ledger (CRIT-2).

🔴 **Kritisk:** Ingen single-prize-cap på pot/lucky/mini-game (CRIT-3).

🟡 **Bekymring:** Compliance-loss soft-fail kan tillate over-spending (HIGH-9).

✅ **Solid:** §11 split-rounding er audit-logget (selv om ledger-entry mangler, HIGH-6).

### 5. Concurrency

✅ **Solid:** Scheduled-engine bruker FOR UPDATE konsekvent på `app_game1_game_state`, `app_game1_scheduled_games`, `app_game1_mini_game_results`. Auto-draw-tick er Redis-lock-beskyttet på cross-instance-nivå.

🟡 **Bekymring:** Ad-hoc engine bruker in-process state — mutex via JS event-loop, ikke explicit lock. Ved `await` kan annen tick gå foran. Kjent edge-case.

🟡 **Bekymring:** Auto-draw-tick uten read-lock (HIGH-7).

### 6. Anti-cheat

✅ **Solid:** PlayerId server-derived; Zod-validering på alle socket-events (`ClaimSubmitPayloadSchema` osv.); per-event rate-limiting (5 claims per 5s); Mini-game-result computed server-side.

🟡 **Bekymring:** Ingen application-level message integrity (HMAC). Socket.IO bruker WebSocket → encrypted via TLS, så MitM er ikke trivielt — men en kompromittert klient kan fortsatt sende forfalskede payloads (mitigert av server-derived state, men noe glipper).

### 7. Disaster recovery

✅ **Solid:** Checkpoint-mekanisme i `BingoEngineRecovery`. `Game1RecoveryService` håndterer orphan scheduled-games. `RedisRoomStateStore` for cross-instance state.

🔴 **Kritisk:** Master-control commit + engine.startGame partial failure (CRIT-7).

🟡 **Bekymring:** Ingen end-to-end test av crash mid-payout for scheduled engine. (Den finnes for ad-hoc engine — `BingoEngine.crashRecoveryPartialPayout.test.ts`.)

### 8. Observability

🟡 **Mangler:** Trace IDs (MED-1).

✅ **Solid:** Strukturerte pino-logger; redaction av sensitive felt; metrics for activerooms, drawerrors, claimSubmitted, payoutAmount, reconnects.

🟡 **Mangler:** Per-phase histogram (MED-2). SLO/SLI-dokumentasjon mangler — ingen "draw-latency P99 må være < 500ms".

### 9. Performance

✅ **Solid:** Postgres-pool tunet via `getPoolTuning()`. JobScheduler unrefs timers.

🟡 **Mangler:** Ingen N+1-analyse av `evaluateAndPayoutPhase` (én SELECT for assignments, separat SELECT for hver `resolveWalletIdForUser` — skulle vært én JOIN). For 50 spillere = 51 queries i hot path.

🟡 **Mangler:** Klient-side render budget (MED-8).

### 10. Test coverage

✅ **Solid:** ~100+ test-filer for game1, dekker mange edge-cases.

🟡 **Mangler:** Ingen full end-to-end happy-path-test (MED-3).

🟡 **Mangler:** Ingen race-condition-tests for scheduled-engine. Bare unit-tests med mock pg-client.

🔴 **Bekymring:** Eksisterende tester fanget IKKE gameType-bug (CRIT-1) fordi alle tester bruker "DATABINGO" som "konvensjon".

### 11. Error handling

✅ **Solid:** `DomainError`-konvensjon med `code` + `message`. Norsk feilmeldinger til bruker. Pino-logger fanger stacks.

🟡 **Bekymring:** "Soft-fail" på compliance-paths kan maskere serielle issues (HIGH-9). Pino warn er ikke nok — bør ha alarm.

### 12. Code quality / arkitektur

🔴 **Kritisk:** Dual engine (CRIT-4, HIGH-1, MED-13).

🔴 **Bekymring:** `BingoEngine.ts` 3109 linjer + `Game1DrawEngineService.ts` 2651 linjer + `Game1MasterControlService.ts` 1552 linjer (MED-4, MED-5, MED-13). Refaktor-momentet er forbi for pilot, men teknisk gjeld stiger.

🟡 **Bekymring:** Massive comments med PR-merker (BIN-690 M1, M2, M3, M4, M5, etc.) som overlapper og krysserefererer. Kodebase-arkæologi tar lang tid for nye utviklere.

### 13. Type safety

✅ **Solid:** `strict: true` enabled. `any` brukes kun i 2 testfiler.

✅ **Solid:** Zod-schemas på socket payloads.

### 14. Security

✅ **Solid:** Parametrisert SQL overalt; XSS-safe i ChatPanelV2; auth via JWT med revocation; rate-limit på connection + event-level; IP-blocking via `SecurityService`; secrets redacted i logger.

🟡 **Bekymring:** Mangler chat-moderation-API (HIGH-11).

### 15. Casino-specific

🔴 **Kritisk:** RTP-budget ikke håndhevet på mini-game/lucky (HIGH-10).

🔴 **Kritisk:** Single-prize-cap mangler (CRIT-3).

🟡 **Mangler:** Ingen "stuck round" detection for scheduled-engine. En master kan glemme å pause/stop, og spillet henger.

✅ **Solid:** Self-exclusion 1-år; loss-limits per-hall + per-spiller; mandatory pause etter 60min play; fail-closed på compliance.

---

## Top 10 Action Items (Prioritert)

1. **CRIT-1:** Bytt `gameType: "DATABINGO"` til `MAIN_GAME` for alle Spill 1 ledger-writes. (2 dev-dager)
2. **CRIT-2:** Skriv ledger-entries fra pot, lucky bonus, mini-game-payouts. (1.5 dev-dager)
3. **CRIT-3:** Apply `prizePolicy.applySinglePrizeCap` på alle payout-paths. (1 dev-dag)
4. **CRIT-4 + HIGH-1:** Innfør runtime-guard `assertNotScheduled(room)` i alle BingoEngine-mutasjoner. (1.5 dev-dager)
5. **CRIT-5:** Mini-game payout + UPDATE i samme transaksjon. (1 dev-dag)
6. **CRIT-6:** Wrap BingoEngine.submitClaim wallet+ledger+audit i én transaksjon. (2 dev-dager)
7. **CRIT-7:** Master-control + drawEngine.startGame i samme tx ELLER rollback ved feil. (1 dev-dag)
8. **HIGH-2:** Implementer `Game1JackpotStateService.resetToStart` hook fra drawNext. (1 dev-dag)
9. **HIGH-9:** Compliance-loss fail-closed (ikke soft-fail) på BUYIN. (0.5 dev-dag)
10. **HIGH-10:** RTP-budget-check på lucky bonus + mini-game. (1 dev-dag)

**Total kritisk-sti:** ~13 dev-dager før pilot-klar regulatorisk.

---

## Comparison to Casino Industry

### Hvor ligger vi vs Pragmatic Play?

| Pragmatic Play / Evolution / NetEnt | Spillorama Spill 1 |
|---|---|
| Ett kanonisk game-state pr. runde, ingen duplikater | To engines for Spill 1 — ad-hoc + scheduled (CRIT-4) |
| RTP er statisk per spill, certifisert av eksternt RNG-lab | RTP er konfigurerbar per hall + sub-game, ingen ekstern cert (akseptert per norsk lov) |
| Jackpot-state har explicit "reservert"/"utbetalt"/"ledig"-state-maskin | Jackpot-state er bare en counter — vinning er ikke modellert (HIGH-2) |
| Single-prize-cap håndheves i én point (typisk PrizeRouter) | Spredt over `BingoEngine.submitClaim` only — ikke i Game1Payout/pot/mini-game (CRIT-3) |
| Ledger-events skrives synchronously i samme tx som wallet | Soft-fail på pot/lucky/mini-game-ledger (CRIT-2) |
| Replay-API for tvister er standard | Mangler (LOW-1) |
| Stuck-round-watchdog for scheduled-rounds | Mangler for scheduled-engine |
| Single-engine-policy: én kjernemodul per spill, helpers er funksjonelle | Spill 1 har 14+ services som peker til hverandre, sirkulær wiring via `setX()`-late-binding |
| Code-review nekter PR-er som adder soft-fail på compliance-path | Spill 1 har soft-fail dokumentert som "fail-closed-pattern" — terminologi brukt feil |

### Hvor er gapet?

Det største gapet er **arkitektonisk koherens**. Pragmatic Play sin BaseGameEngine har:
- ÉN klar source-of-truth per spill-state.
- ÉN klar payout-pipeline der alle pengeflyt går gjennom samme guard-stack (cap, RTP, ledger, audit, idempotency).
- INGEN sirkulær wiring — services fungerer som DAG.

Spill 1 har:
- TO source-of-truth (in-memory + DB) som kommuniserer via late-binding.
- 4+ payout-pipelines (BingoEngine.submitClaim, Game1PayoutService.payoutPhase, Game1PotEvaluator.runAccumulatingPotEvaluation, Game1LuckyBonusService.payout, Game1MiniGameOrchestrator.creditPayout) — hver med sine egne guards. Inkonsistens er garantert.
- Massiv sirkulær wiring via `setDrawEngine()`, `setPotService()`, `setMiniGameOrchestrator()`, `setOddsenEngine()`, `setBingoEngine()`, `setAdminBroadcaster()`, `setPlayerBroadcaster()`. Konstruksjons-rekkefølgen i `index.ts` er sårbar.

---

## Recommended Architecture Changes

### Kortsiktig (før pilot)

1. **Fix CRIT-1 til CRIT-7.** Disse er pilot-blokkere.
2. **Innfør `Spill1PayoutCoordinator`** som er ENESTE entry-point for alle Spill 1-payouts (phase, jackpot, pot, lucky, mini-game). Den eier prize-cap-check, RTP-budget-check, ledger-write, audit-write, wallet-credit. Eksisterende services blir input-providere.
3. **Slett ad-hoc-pathen for Spill 1.** `BingoEngine.startGame/drawNextNumber/submitClaim` skal kaste hvis `room.gameSlug === "bingo"`. Ingen scheduled-game skal bruke ad-hoc-flow. (Spill 2/3 fortsetter på ad-hoc.)

### Mellomlang sikt (post-pilot, pre-GA)

4. **Refaktor `BingoEngine.ts` til to filer:** `BingoEngine.ts` for runtime-state-mut + `BingoCoordinator.ts` for I/O-orchestrering (wallet, ledger, audit). Maks 800 linjer per fil.
5. **Innfør `RoundContext`** som verdi-objekt som passes gjennom alle guards. Erstatter sirkulær wiring.
6. **Skriv en kanonisk integration-test:** "End-to-end Spill 1 happy-path" som dekker alle 5 faser, mini-game, jackpot, lucky, multi-winner, multi-hall. Skal være obligatorisk pre-merge for endringer i Spill 1-paths.

### Langsiktig (post-GA)

7. **Vurder rewrite av Spill 2/3 til scheduled-modell.** Ad-hoc engine er teknisk gjeld som vil fortsette å forsterke dual-state-issues.
8. **Innfør seed-arkivering** for replay/tvist.
9. **Moderation-suite for chat.**

---

## Conclusion

**For PM:** Spill 1 er **ikke pilot-klar** uten å fikse de 7 CRITICAL og minst 4 HIGH-funn. Estimert ~13 dev-dager kritisk sti til regulatorisk klarering. Selv etter fix er det betydelig teknisk gjeld i dual-engine-arkitekturen som bør håndteres post-pilot for at koden skal nærme seg casino-industri-standard.

**Konkret beslutning som trengs:** Skal Tobias prioritere å fikse alle CRITICAL før pilot (anbefalt, ~2 uker forsinkelse hvis 1 dev), eller akseptere noen som kjente risikoer med øre-marker i regulatory-dokumentasjon (ikke anbefalt)?

Hvis sistnevnte: minimum CRIT-1, CRIT-3, CRIT-7 må uansett løses — disse er Lotteritilsynet-revisjons-blokkere.
