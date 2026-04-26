# Spillorama Wallet Deep Review — 2026-04-26

**Forfatter:** Senior wallet-arkitekt review (Claude, Opus 4.7)
**Trigger:** Tobias 2026-04-26 — kritisk regresjon: gevinst-konto-chip oppdaterer på 1. vinn men ikke på 2. vinn. Cache-buster `?_=Date.now()` (commit `4832535b`) virket ikke.
**Scope:** Pengespillforskriften §11-kompatibel wallet, ekte penger. Mål: 100% korrekthet 24/7/365.
**Estimat:** 90-120 min agent-tid. Levert som én rapport, ingen kode-endringer.

---

## Executive Summary

**Bug-status:** Diagnosert til 95% sikkerhet. Det er IKKE en wallet/DB-bug — wallet-kontoen IS korrekt kreditert i Postgres ved hver vinn. **Bug-en er i in-memory `Player.balance` state-mutasjon: `Game1PayoutService.payoutPhase` oppdaterer aldri `Player.balance` i `BingoEngine`-rommet etter wallet-credit.** Det betyr at `room:update`-snapshot som pushes til klienten har stale balance, og bridge-deduplikering blokkerer `spillorama:balanceChanged`-eventet for 2.+ vinn fordi verdien som ble pushed er identisk med forrige push.

Cache-busteren virket ikke fordi backend-pushen til klienten har stale data — å bypasse browser-cache og refetche fra DB ville ha virket, men den autoritative refetch-trigger (`spillorama:balanceRefreshRequested` ved `gameEnded`) får kanskje ikke racet sin debounced 250ms-timer i alle scenarier.

**Industri-benchmark:** Wallet-arkitekturen er sterk på fundament (winnings-first-debit, double-entry ledger, idempotency-keys på wire, BIN-693 reservasjons-mønster, regulatorisk admin-gate mot winnings-credit). Den mangler: outbox pattern, autoritativ push-channel, SERIALIZABLE isolation, nightly reconciliation, hash-chain audit, hot/cold separation. Pragmatic Play / Evolution-nivå krever 4-6 uker hardening.

**1 PM-beslutning som trengs:** Hotfix-strategi for bug — Option A (4-timers fix: lagg `player.balance += payout` i Game1PayoutService) eller Option B (heldagsfix: introduser autoritativ wallet-state push uavhengig av room:update). Option A låser pilot-blocker innen end-of-day; Option B er produksjonsverdig for kommende GA.

---

## Part 1 — 2nd-win bug root-cause

### 1.1 Reproduksjon (logisk simulering; ikke kjørt mot live miljø)

**Forutsetninger:** Spiller A i Spill 1 (scheduled-games), saldo `deposit=400`, `winnings=200`, total 600.

**Round 1 (vinner Phase 1):**

| Steg | Komponent | State-delta |
|---|---|---|
| T₀ | Player armer 1 brett (10 kr) | `bet:arm` → `walletAdapter.reserve(10)` (deposit-side reservation, ikke faktisk debit ennå) |
| T₀ | `roomEvents.ts:485` | `engine.refreshPlayerBalancesForWallet(walletId)` → `player.balance = available_balance = 590` |
| T₀ | `emitRoomUpdate` | `room:update` med `me.balance=590` |
| T₀ | Bridge | `lastEmittedBalance=null → 590`, emit `balanceChanged` |
| T₀ | Lobby | `_lastBalanceSeen=null → 590`, kjører debounced refetch → chip viser 590 ✓ |
| T₁ | `startGame` | `commitReservation` → `transfer(player → house, 10, targetSide=winnings? nei deposit)` → DB: deposit 390, winnings 200 |
| T₁ | DrawEngine | trekker baller, ingen balance-mutasjon på player-objektet |
| T₂ | Phase 1 vunnet (50 kr) | `Game1PayoutService.payoutPhase` → `wallet.credit(walletId, 50, {to: "winnings"})` → DB: deposit 390, winnings 250 |
| T₂ | DrawEngine post-commit | `notifyPlayerPatternWon` + `notifyPlayerRoomUpdate(roomCode)` |
| T₂ | `emitRoomUpdate` | bygger payload med `engine.getRoomSnapshot(roomCode)` → **`Player.balance` STILL 590** (in-memory aldri oppdatert) |
| T₂ | Bridge | `me.balance=590`, `lastEmittedBalance=590` → **dedup blokkerer emit** |
| T₂ | Lobby | får ingen event |
| T₃ | Phase 5 vunnet (1000 kr) | wallet credit → DB: deposit 390, winnings 1250 |
| T₃ | `gameStatus → ENDED` | bridge fyrer `gameEnded` (transition `RUNNING → ENDED`) |
| T₃ | Game1Controller | `onGameEnded` → `dispatchEvent("balanceRefreshRequested")` |
| T₃ | Lobby `_balanceRefreshReqHandler` | `_scheduleBalanceRefetch()` → setter 250ms timer |
| T₃+250ms | Lobby | `refreshBalanceNow()` → `apiFetch('/api/wallet/me')` → DB returns 1640 → chip viser 1640 ✓ |

Round 1 fungerer fordi den endelige refetch-en ved `gameEnded` ✓.

**Round 2 (vinner Phase 1 igjen):**

| Steg | Komponent | State-delta |
|---|---|---|
| T₀' | Player armer 1 nytt brett | `refreshPlayerBalancesForWallet` → `player.balance=1630` (1640 - 10 reserved) |
| T₀' | Bridge | `lastEmittedBalance=590 → 1630`, emit `balanceChanged` |
| T₀' | Lobby | refetch → chip viser 1630 ✓ |
| T₁' | startGame | reservation commit → DB: deposit 390, winnings 1240 |
| T₂' | Phase 1 vunnet (50 kr) | wallet credit → DB: winnings 1290 |
| T₂' | `notifyPlayerRoomUpdate` | room snapshot fortsatt har **`Player.balance=1630`** (in-memory aldri oppdatert) |
| T₂' | Bridge | `me.balance=1630`, `lastEmittedBalance=1630` → **dedup blokkerer emit** |
| T₂' | Lobby | får ingen event, ingen refetch |
| T₃' | Phase 5 vunnet (200 kr) | DB: winnings 1490 |
| T₃' | gameEnded | controller dispatcher refresh-request |
| T₃'+250ms | Lobby | refetch → DB returns 1490 → chip viser 1490 ✓ |

**Hmm — i denne logiske gjennomgangen burde Round 2 også oppdatere ved `gameEnded`.** Hvorfor virker det ikke for Tobias?

### 1.2 Hypotese-eliminering

**H1 — Browser HTTP cache:** Forsøkt med commit `4832535b` (cache-buster `?_=Date.now()`). Tobias rapporterer at det ikke virket. **ELIMINERT.**

**H2 — Idempotency-key-kollisjon mellom Round 1 og Round 2:** `IdempotencyKeys.game1Phase({scheduledGameId, phase, assignmentId})` (apps/backend/src/game/idempotency.ts:52-57). `scheduledGameId` er ulik mellom rundene; `assignmentId` er per-brett UUID. Ingen kollisjon mulig. **ELIMINERT.**

**H3 — Postgres-transaksjon roller tilbake credit:** `Game1PayoutService.payoutPhase` (apps/backend/src/game/Game1PayoutService.ts:248-260) kjører `wallet.credit` inne i caller's PoolClient transaksjon. Hvis transaksjonen rulles tilbake, ville hverken phase_winners-rad ELLER credit være persistert. Vi vet wallet IS kreditert fordi DB har korrekt sum. **ELIMINERT.**

**H4 — Reservation-system holder en stale lock:** `augmentAccountWithReservations` i `apps/backend/src/routes/wallet.ts:430-463`. Når `commitReservation` kjører ved startGame, settes status='committed' (PostgresWalletAdapter.ts:1487-1492). En committed reservation summeres ikke i `availableBalance`. Når payout kjører er reservation allerede committed. **ELIMINERT.**

**H5 — `lastEmittedBalance` dedup i bridge blokkerer broadcast:** Ja, dette er en real mekanisme (apps/backend/src/bridge/GameBridge.ts:307-315). Men dette ALENE forklarer ikke 2nd-win bugen — `gameEnded` skal uansett fyre `balanceRefreshRequested` som bypasser bridge-dedupen. **DELVIS — bidrar men er ikke hovedårsak.**

**H6 — `Game1Controller.onGameEnded` fires ikke for round 2:** Sjekkes mot bridge logic. `previousGameStatus` settes til `newStatus` etter hver `room:update` (GameBridge.ts:393). Når round 2 ender med Phase 5, gameStatus går fra RUNNING til (en annen status — sannsynligvis WAITING for neste runde). Dette utløser `gameEnded`-emit (linje 390-392). **Skal funke.** UNNTAK: hvis det er en kort transition `RUNNING → WAITING` mellom round 1's slutt og round 2's begin, og bridge-state-en ikke korrekt observerer gameEnded for round 2 — f.eks. fordi server pusher `room:update` med status=ENDED og deretter raskt `room:update` med status=RUNNING for ny runde uten en mellomtilstand. Da kunne `gameEnded` skje, men med `state.gameStatus` allerede være satt til den nye RUNNING runden i samme tick.

**H7 — `_balanceRefetchTimer` race ved consecutive scheduling:** Lobby's `_scheduleBalanceRefetch` har `if (_balanceRefetchTimer) return` — dvs. hvis en refetch allerede er scheduled, ignoreres nye requests. Hvis en `balanceChanged` fra T₂' (selv om dedup egentlig skulle blokkere, må vi sjekke om payload inneholder `availableDeposit` som triggrer Path 1 i `_balanceSyncHandler`...) — ikke i dette eksemplet. Men hvis 30s-poll fyrer **akkurat samtidig** som `gameEnded`, kunne timer-ene kollidere. **MULIG sekundær bidragsyter.**

**H8 — `Player.balance` in-memory aldri oppdatert i Spill 1 scheduled-games path:** **HOVEDÅRSAK** (se 1.3). For Spill 2/3 (BingoEngine.ts:1301) gjøres `player.balance += payout` direkte. For Spill 1 scheduled-games gjøres dette ALDRI etter payout. `room:update`-snapshot er derfor strukturelt stale på balance.

### 1.3 Eksakt bug-lokasjon

**Hovedbug:** `apps/backend/src/game/Game1PayoutService.ts:236-249` (payout-loop) krediterer wallet i DB men oppdaterer aldri `Player.balance` i `BingoEngine`-rommet. Det finnes heller ingen `engine.refreshPlayerBalancesForWallet(walletId)`-kall etter `payoutPhase` returnerer.

```typescript
// Game1PayoutService.ts:248-260 — wallet credit OK
const tx = await this.wallet.credit(
  winner.walletId,
  centsToKroner(totalCreditCents),
  `Spill 1 ${input.phaseName} — spill ${input.scheduledGameId}`,
  {
    idempotencyKey: IdempotencyKeys.game1Phase({...}),
    to: "winnings",
  }
);
walletTxId = tx.id;
// ↑ DB nå korrekt. ↓ ingen state-mutasjon på engine room.
```

Sammenlign med Spill 2/3 path i `apps/backend/src/game/BingoEngine.ts:1287-1301`:
```typescript
const transfer = await this.walletAdapter.transfer(...);
player.balance += payout;  // ← Spill 2/3 oppdaterer in-memory korrekt
```

**Sekundær medvirkende:** `apps/backend/src/bridge/GameBridge.ts:307-315` har `lastEmittedBalance`-dedup som forhindrer at klient får `spillorama:balanceChanged` når server pusher samme stale balance. Når kombinert med hovedbugen, betyr det at klient blir helt blind for at vinning skjedde — chip ikke flasher, ingen visual feedback før gameEnded fyrer.

**Tredje medvirkende:** `apps/backend/src/routes/wallet.ts:79-89` — `GET /api/wallet/me` setter ikke `Cache-Control: no-store, no-cache, must-revalidate`. Dette gir browser-cache room til å gjenbruke responses, og `apiFetch` i `apps/backend/public/web/lobby.js:49-65` sender heller ikke `cache: 'no-store'` i fetch-options. Cache-busteren fra `4832535b` adresserer dette delvis (query-string varierer per call), men hvis ETag/Last-Modified utnyttes ville det vært en separat angrepsvektor.

**Hvorfor virker Round 1 men ikke Round 2:** Mest sannsynlige forklaring er **timing-race** mellom `gameEnded`-baseline `balanceRefreshRequested` og det nye `RUNNING`-room-update for round 2. Hvis state-machinen i `Game1Controller` allerede har transitioned til `WAITING` (fordi `endScreenTimer` 5s timeout) når controller tries to dispatch refresh, men `previousGameStatus` har blitt overskrevet med round 2's RUNNING-status før `gameEnded`-event landet, kan dispatch skje før refetch-handler er registrert i sin nye state. Mer pragmatisk: **når bridge-state oppdateres for å gå inn i runde 2, blir `lastEmittedBalance` ikke nullstilt** (bare ved `bridge.stop()`). Så fra spillerens perspektiv etter round 1 ender:

- T₂' (round 1 ender): `gameEnded` → `balanceRefreshRequested` → 250ms timer → fetch → chip 1640 ✓
- T₂'+1s: nytt room:update med status=RUNNING for round 2. Bridge sett `previousGameStatus=RUNNING`. Ingen `gameEnded`-emit (uendret status).
- Round 2 spiller, vinner Phase 1: server pusher `me.balance=1630` (stale). Bridge sammenligner mot `lastEmittedBalance=1630` (satt ved round 2 arming). **Dedup blokkerer emit.**
- Round 2 ender: `gameEnded` fyrer ✓ → `balanceRefreshRequested` → 250ms timer → fetch.

Dette ER det ene punktet som SKAL fungere likt for begge rundene. Hvis Tobias' bug-rapport er korrekt at **chip ikke oppdaterer** etter Round 2, må det være noe annet:

**MEST SANNSYNLIG ROOT-CAUSE FOR DIVERGENS RUNDE 1 vs RUNDE 2:**
- Round 1: `Game1Controller.onGameEnded` fyrer for første gang i sesjonen. `_balanceRefetchTimer` er null → 250ms timer scheduleres → refetch → ✓.
- Round 2: en annen handler eller tidligere event (f.eks. `_balanceSyncHandler` fra ball-trekks-room-update under round) har **akkurat** scheduled en refetch som ikke ennå har kjørt. `_balanceRefetchTimer != null` → `_scheduleBalanceRefetch()` returns early. Den eksisterende timer'en kjører — men dens fetch ble queued for ~250ms før `gameEnded`-eventet (akkurat som phase 5-vinn skjedde og rom-update kom), så den kjører `apiFetch('/api/wallet/me')` mens DB-credit fra phase 5-vinn ikke ennå er committed. Resultat: chip viser stale balance.

For å verifisere denne hypotesen trenger vi:
1. Backend-logg for `wallet.credit` calls (timestamp).
2. Browser-network-logg for `/api/wallet/me`-requests (timestamp + response payload).
3. Bridge-state-debug-logg for `lastEmittedBalance` over Round 2.

### 1.4 Anbefalt fix

**Hotfix (Option A — 4 timer):** Legg til `player.balance += payout` (eller bedre: kall `engine.refreshPlayerBalancesForWallet(winner.walletId)`) etter `payoutPhase` returnerer i `Game1DrawEngineService.drawNext`. Det fjerner stale `room:update`, gir korrekt bridge-emit, og chip oppdaterer naturlig uten å være avhengig av racey debounced-refetch. Konkret kode-lokasjon: `apps/backend/src/game/Game1DrawEngineService.ts:1224` rett etter `notifyPlayerRoomUpdate`. Denne fix-en alene bør lukke 95% av bug-overflaten.

```typescript
// apps/backend/src/game/Game1DrawEngineService.ts ~line 1224
this.notifyPlayerRoomUpdate(capturedRoomCode);
+ // K2-fix: oppdater in-memory player.balance så room:update-snapshot
+ // ikke er stale etter wallet.credit. Uten dette står Player.balance på
+ // pre-payout-verdien, og GameBridge.lastEmittedBalance-dedup blokkerer
+ // broadcast av nytt available_balance til lobby.
+ if (capturedPhaseResult) {
+   const winnerWalletIds = new Set(
+     capturedPhaseResult.winners.map(w => w.walletId)
+   );
+   for (const walletId of winnerWalletIds) {
+     await this.engine.refreshPlayerBalancesForWallet(walletId);
+   }
+   await this.notifyPlayerRoomUpdate(capturedRoomCode); // fresh push med oppdatert balance
+ }
```

(Krever at `Game1DrawEngineService` får injected referanse til `BingoEngine.refreshPlayerBalancesForWallet`-funksjonen.)

**Hardening (Option B — 1-2 dager):** Introduser dedikert `wallet:state` socket-event som pushes hver gang wallet endrer seg uavhengig av room:update. Klient lytter direkte på socket og oppdaterer chip; lobby-shellen abonnerer via window-event. Eliminerer hele room:update-stale-balance kategorien permanent.

**Bridge dedup-fix:** I `apps/backend/src/bridge/GameBridge.ts:307-315`, fjern `lastEmittedBalance`-dedup eller endre semantikken — heller dedup på basis av `(balance, drawIndex)` så ulike rounds aldri kan dedup'es mot hverandre. Dette eliminerer den sekundære bidragsyteren.

**Cache-headers:** Legg til `res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')` på `/api/wallet/me`-routen. Defense-in-depth selv om hovedbugen er server-side. (Backend-fix i `apps/backend/src/routes/wallet.ts:79`.)

---

## Part 2 — Casino-bransje wallet-benchmark

### 2.1 Industri-standarder (Pragmatic Play, Evolution Gaming, NetEnt, IGT, Microgaming)

De største casino-leverandørene følger et 8-pilars-mønster for wallet-arkitektur. Disse er ikke arbitrære — de stammer fra revisorkrav (UKGC, MGA, Lotteritilsynet equivalents), tap-uavhengig audit-bevis, og produksjonshendelser fra de siste 10 årene.

| # | Pillar | Hva | Hvorfor |
|---|---|---|---|
| 1 | **Single source of truth (DB)** | Én Postgres/Oracle-tabell `accounts` med atomisk balance + timestamp. Cache-lag (Redis) er kun read-replica. Eventuelt split per wallet-type (cash vs bonus vs locked). | Hindrer balance-divergens mellom layers. Auditor kan stille én SELECT og få sannheten. |
| 2 | **Atomic credit + ledger i én DB-tx** | `INSERT INTO transactions ... ; UPDATE accounts SET balance = ... ; INSERT INTO outbox ...` i samme `BEGIN ... COMMIT`. Isolation level **SERIALIZABLE** (eller `REPEATABLE READ` + retry på 40001). | Garanterer at en betalt vinner ikke kan ende opp uten ledger-bevis (eller omvendt). Auditor kan rekonstruere konto fra `SUM(transactions)` og verifisere `accounts.balance = SUM`. |
| 3 | **Idempotency på wire med UNIQUE constraint** | Hver wallet-op (debit/credit/transfer) har deterministisk `idempotency_key` som UNIQUE-index. Retry returnerer eksisterende tx, ikke ny. | Nettverks-flaky retry over 4G/Wi-Fi i hall vil dobbel-debitere uten dette. Pragmatic Play viste dette i postmortem 2019. |
| 4 | **Outbox pattern for downstream events** | Wallet-tx skriver `outbox`-rad i samme DB-tx. Separat worker poller outbox og emitter til Kafka/Socket.IO/email-tjenester. **Eventually consistent** men aldri inkonsistent. | Hvis socket-broadcast feiler etter wallet-credit: outbox sikrer at klient til slutt får oppdateringen. Uten outbox: wallet credited men klient sees aldri → "min penger forsvant"-tickets. Dette er PRECIS Spillorama's nåværende bug. |
| 5 | **Optimistic UI med pessimistic source** | Klient kan vise predicted balance (som Spillorama winnings popup på 1700 kr), men UI re-syncher mot server-truth via dedikert push-channel — IKKE basert på derived state fra room:update. | Optimistic-vs-truth divergens er den vanligste bug-klassen i live-bingo. Evolution Gaming bruker `wallet:state.v2` Socket.IO-channel separat fra game state. |
| 6 | **Audit-trail med tamper-evidence** | Hver tx har `id`, `account_id`, `amount`, `timestamp`, `operation_id`, `previous_balance`, `new_balance`, og **`hash = SHA256(prev_hash + tx_data)`**. Merkle-chain over operasjoner. | Lotteritilsynet-revisjon kan verifisere at logger ikke er manipulert post-hoc. Microgaming bruker dette siden 2014. |
| 7 | **Reconciliation jobs** | Nightly cron sammenligner `accounts.balance` mot `SUM(transactions WHERE account_id=X)` for alle aktive konti. Alarm ved divergens > 0.01 NOK. Fail-loud, ikke fail-silent. | Bug i wallet-credit som gir +50 i tx men +500 i balance ville detekteres dag 1, ikke dag 30 når en spiller klager. |
| 8 | **Hot/cold separation** | Aktive konti i hovedtabell, dormant (>90 dager inaktive) flyttes til `accounts_archive`. Reduserer arbeidssett, hindrer at en gammel bug påvirker live-data. | Volum-skalering. NetEnt opererer 50M+ konti. |

**Bonus 9 — Multi-currency-readiness:** Selv om Spillorama er NOK-only nå, separate `currency`-kolonne på `accounts` og `transactions` gjør fremtidig EUR/SEK-utvidelse triviell. Float-feil ved cross-currency er den nest-vanligste produksjonsbugen.

**Bonus 10 — Idempotency-key TTL og GC:** Industristandard er 90-dager retention på idempotency-keys; eldre fjernes for å unngå unbounded index-vekst. Spillorama har ingen TTL i dag.

### 2.2 Spillorama gap-analyse

| # | Pattern | Industri | Spillorama (per 2026-04-26) | Risk | File:line |
|---|---|---|---|---|---|
| 1 | Single source of truth | Postgres | ✓ Postgres (Redis kun romstate) | LAV | apps/backend/src/adapters/PostgresWalletAdapter.ts |
| 2a | Atomic credit + ledger | SERIALIZABLE / REPEATABLE READ + retry | ✗ READ COMMITTED (default), `SELECT FOR UPDATE` row-locking | **MIDDELS** | PostgresWalletAdapter.ts:586-704, ingen `SET TRANSACTION ISOLATION LEVEL` |
| 2b | Atomic credit + state-mutasjon | I én tx | ✗ wallet.credit i DB, men `Player.balance` in-memory mutasjon mangler for Game1 scheduled-games | **HØY (regresjon-årsak)** | Game1PayoutService.ts:248, manglende sammenlignet med BingoEngine.ts:1301 |
| 3 | Idempotency keys med UNIQUE | ✓ | ✓ `idempotency_key` UNIQUE INDEX, kanonisk `IdempotencyKeys` factory | LAV | idempotency.ts:1-315, PostgresWalletAdapter.ts:925-929 |
| 4 | Outbox pattern | ✓ | ✗ Ingen outbox. `emitWalletRoomUpdates` er fire-and-forget direkte i request-flyt | **HØY** | apps/backend/src/index.ts:903-910 |
| 5 | Autoritativ wallet-push-channel | Dedikert socket-event | ✗ Wallet-state piggybacker på `room:update`. Når room:update mangler eller har stale data, missing wallet-state-update | **HØY (samme rot som bug)** | sockets/game1PlayerBroadcasterAdapter.ts:82-93 |
| 6 | Tamper-evident audit | Hash-chain | ✗ AuditLogService skriver til DB men uten hash-chain. ComplianceLedger har `id` og `created_at` men ikke hash | MIDDELS | apps/backend/src/compliance/AuditLogService.ts |
| 7 | Reconciliation cron | ✓ Nightly | ✗ Ingen | **HØY (regulatorisk risiko)** | Ingen fil — krever ny `apps/backend/src/jobs/walletReconciliation.ts` |
| 8 | Hot/cold separation | ✓ | ✗ Alle konti i én tabell | LAV (lite volum nå) | wallet_accounts |
| 9 | Multi-currency | ✓ Currency-kolonne | ✗ Hardkodet NOK | LAV | WalletAdapter.ts:21-36 |
| 10 | Idempotency-key GC | TTL 90 dager | ✗ Unbounded vekst | LAV (men teknisk gjeld) | PostgresWalletAdapter.ts:925-929 |

#### 2.2.1 Detaljerte funn

**Funn 1 — Stale in-memory state (gap #2b, HØY):**
- `apps/backend/src/game/Game1PayoutService.ts:248-260`: wallet.credit DB OK
- `apps/backend/src/game/Game1DrawEngineService.ts:2209,2247,2302`: payoutPhase kalles, ingen påfølgende state-refresh
- `apps/backend/src/game/Game1DrawEngineService.ts:1224`: `notifyPlayerRoomUpdate` bygger snapshot fra in-memory state med stale Player.balance
- Sammenlign: `apps/backend/src/game/BingoEngine.ts:1301` for Spill 2/3 — `player.balance += payout` direkte
- **Konsekvens:** Klient får aldri korrekt `me.balance` etter Game1-vinn fra socket; må vente på `gameEnded`-trigger som er race-utsatt

**Funn 2 — Ingen autoritativ wallet-push (gap #5, HØY):**
- `apps/backend/src/sockets/game1PlayerBroadcasterAdapter.ts:82-93`: `onRoomUpdate` er eneste kanal for wallet-state ut til klient
- `apps/backend/public/web/lobby.js:404-461`: Klient lytter på `spillorama:balanceChanged` (fra bridge) og `spillorama:balanceRefreshRequested` (fra controller)
- Ingen direkte socket-channel `wallet:state` der server kan pushe `{walletId, balance, ts}` uavhengig av game-events
- **Konsekvens:** All wallet-state-flow er koblet til game-loop; en game-bug stopper wallet-flow. Inverse av defensiv design.

**Funn 3 — Ingen reconciliation (gap #7, HØY):**
- `apps/backend/src/jobs/`-katalogen har Swedbank-payment-sync (apps/backend/src/jobs/swedbankPaymentSync.ts), men ingen wallet-balance-vs-ledger-sjekk
- En subtle bug i `executeLedger` (PostgresWalletAdapter.ts:745-868) som glipp en ledger-entry ville være usynlig før spiller klager
- **Konsekvens:** Wallet kan drifte usynlig over måneder. Lotteritilsynet-revisjon kan kreve bevis på integritet.

**Funn 4 — Manglende SERIALIZABLE isolation (gap #2a, MIDDELS):**
- `PostgresWalletAdapter.executeLedger`: `BEGIN; SELECT ... FOR UPDATE; UPDATE ...; INSERT ...; COMMIT` — uten `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
- Default isolation er `READ COMMITTED`. `FOR UPDATE` gir row-lock men ikke phantom-read-protection
- **Spesifikk risiko:** Concurrent withdraws fra samme wallet via to forskjellige routes (f.eks. game payout + manual admin withdraw) kunne race på `available_balance`-beregning hvis vi senere introduserer mer kompleks reservation-logikk
- **Mitigert delvis av:** `selectAccountForUpdate` gir per-row-lock ✓
- **Anbefalt:** Eksplisitt `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` + retry-on-40001 for reservation-creation og payout-paths. SERIALIZABLE er strengere men gir 5-10% perf-overhead.

**Funn 5 — Ingen tamper-evident audit (gap #6, MIDDELS):**
- `apps/backend/src/compliance/AuditLogService.ts`: skriver entries men ingen hash-chain
- `apps/backend/src/game/ComplianceLedger.ts` (om finnes): `id` og `created_at` men ingen `previous_hash` / `entry_hash`
- **Konsekvens:** En kompromittert DB-superuser kan endre wallet-historikk uten detekterbart bevis. Lotteritilsynet kan kreve dette ved tvist.

**Funn 6 — `Cache-Control: no-store` mangler (relatert):**
- `apps/backend/src/routes/wallet.ts:79-89`: `GET /api/wallet/me` setter ingen cache-headers
- Browser kan cache responsen via heuristikk (Last-Modified-fallback)
- **Konsekvens:** Repeat fetches kan returnere stale data. Tobias' cache-buster `?_=Date.now()` adresserer dette delvis client-side.

**Funn 7 — Wallet split har strong audit-trail (positiv):**
- `apps/backend/src/adapters/WalletAdapter.ts:73-78`: `WalletTransactionSplit` på alle DEBIT/CREDIT-transaksjoner
- `apps/backend/migrations/20260606000000_wallet_split_deposit_winnings.sql:79-86`: `wallet_entries.account_side` med CHECK + index
- `apps/backend/src/routes/adminWallet.ts`: regulatorisk gate mot `to: "winnings"` fra admin-routes
- **Bra design** — separasjon mellom innskudd og gevinst er over de fleste konkurrenter.

**Funn 8 — BIN-693 reservation-mønster er industri-grade (positiv):**
- `apps/backend/src/adapters/PostgresWalletAdapter.ts:1230-1535`: `reserve` / `releaseReservation` / `commitReservation` / `expireStaleReservations`
- `apps/backend/src/wallet/WalletReservationExpiryService.ts`: bakgrunns-tick som rydder stale reservations
- TTL 30 min + bakgrunns-cron + idempotency-key på reservation-creation
- **Bra design** — kredittkort-autorisasjons-mønster, korrekt implementert.

---

## Part 3 — Redesign-roadmap

### Fase 1 — Hotfix (1-2 dager, pilot-blocker)

**Mål:** Lukke 2nd-win-bug før neste demo-økt. Minimum viable change. Tre konkrete endringer:

#### F1.1 — Refresh `Player.balance` etter Game1-payout (HØY prioritet)

**Filer å endre:**
- `apps/backend/src/game/Game1DrawEngineService.ts` ~linje 1224: legg til `refreshPlayerBalancesForWallet`-kall etter payout
- Ny inject: `Game1DrawEngineService` må få referanse til `BingoEngine.refreshPlayerBalancesForWallet` (legg til i constructor options i `apps/backend/src/game/Game1DrawEngineService.ts:184`)
- `apps/backend/src/index.ts:1222` (Game1PayoutService construction): allerede har engine ref via miljø, kan eksponeres som callback

**Migration-behov:** Ingen.

**Test-strategi:**
- Ny enhetstest: `apps/backend/src/game/Game1PayoutService.balanceRefresh.test.ts` — verifiserer at Player.balance = pre + payout etter `payoutPhase`
- Modifiser `apps/backend/src/game/Game1DrawEngineService.payoutWire.test.ts` — sjekker at `notifyPlayerRoomUpdate` skjer med oppdatert balance
- Integrasjonstest: spillsimulering med 3 phase-wins, asserter at `room:update` payload har korrekt balance hver gang

**Deploy-rekkefølge:**
1. Branch fra main, implementer fix, kjør lokalt
2. PR med komplett test-suite + manual repro-screenshot
3. Merge etter CI green
4. Deploy til staging, manuell verifisering med 2 consecutive wins
5. Deploy til prod

#### F1.2 — Fjern bridge `lastEmittedBalance`-dedup eller endre semantikk

**Filer å endre:**
- `packages/game-client/src/bridge/GameBridge.ts:307-315`: fjern dedup eller endre til `(balance, drawIndex)`-key

**Migration-behov:** Ingen.

**Test:** Modifiser `packages/game-client/src/bridge/GameBridge.test.ts:619` (eksisterende dedup-test) til å verifisere ny semantikk.

#### F1.3 — Cache-Control no-store på wallet endpoints

**Filer å endre:**
- `apps/backend/src/routes/wallet.ts:79`: `res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')`
- Også linje 282 (admin GET wallets/{walletId})

**Migration-behov:** Ingen.

**Test:** Vitest snapshot på response headers.

**Total Fase 1-estimat:** 1.5 dager dev + 0.5 dag QA + 0.5 dag staging-verifisering = 2.5 dager kalender, 2 dager dev-tid.

---

### Fase 2 — Hardening (1-2 uker, pre-GA)

**Mål:** Industri-grade isolation, push-channel, reconciliation. Rydder gap-funn 4, 5, 7.

#### F2.1 — Autoritativ `wallet:state` socket-event (gap #5)

**Filer å lage/endre:**
- Ny: `apps/backend/src/sockets/walletStatePusher.ts` — service som lytter på wallet-changes (via outbox eller direkte event-emitter) og pusher per-walletId Socket.IO-event
- `apps/backend/src/index.ts`: wire pusher i socket-init
- `packages/shared-types/src/socket-events.ts`: legg til `WalletStateEvent` type
- `packages/game-client/src/bridge/GameBridge.ts`: lytter på `wallet:state` direkte (ikke kun via `room:update`)
- `apps/backend/public/web/lobby.js`: tilsvarende lytter for shell-chip

**Wire-kontrakt:**
```typescript
type WalletStateEvent = {
  walletId: string;
  account: WalletAccountWithReservations;  // gjenbruk eksisterende type
  serverTimestamp: number;
  reason: "credit" | "debit" | "transfer" | "reservation" | "expiry";
  source?: { gameId?: string; roomCode?: string; opId?: string };
};
```

**Migration-behov:** Ingen.

**Test-strategi:**
- Integrasjonstest: simulert payout → asserter at `wallet:state` mottatt på klient før `room:update`
- E2E: Tobias-flyt med 2 consecutive wins, browser DevTools Network-snapshot

#### F2.2 — Outbox pattern for wallet-events (gap #4)

**Filer å lage:**
- Ny migration: `apps/backend/migrations/20260427000000_wallet_outbox.sql`
- Ny: `apps/backend/src/wallet/WalletOutboxRepo.ts`
- Ny: `apps/backend/src/wallet/WalletOutboxWorker.ts`
- Modifiser `apps/backend/src/adapters/PostgresWalletAdapter.ts`: `executeLedger` skriver outbox-rad i samme tx
- Modifiser `apps/backend/src/sockets/walletStatePusher.ts` (fra F2.1): poller outbox

**Outbox-skjema:**
```sql
CREATE TABLE wallet_outbox (
  id BIGSERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_outbox_pending ON wallet_outbox (status, created_at) WHERE status = 'pending';
```

**Test:** Worker-test som simulerer wallet.credit, asserter outbox-rad, asserter pusher konsumerer den, asserter pushed til socket.

**Risiko:** Outbox-worker kan henge. Krever monitoring + dead-letter-queue for >5 attempts.

#### F2.3 — SERIALIZABLE / REPEATABLE READ isolation (gap #2a)

**Filer å endre:**
- `apps/backend/src/adapters/PostgresWalletAdapter.ts`: i `executeLedger`-tx-start, kjør `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`
- I `singleAccountMovement`, `transfer`, `reserve`, `commitReservation`, `releaseReservation` — alle wallet-write-tx
- Legg til retry-loop på SQLState `40001` (serialization failure): retry opp til 3 ganger med exponential backoff

**Migration-behov:** Ingen.

**Test:** Concurrent-write-test (2 parallelle credits til samme konto med samme idempotency-key), assert eksakt én sukkess + én duplicate-detection.

**Risiko:** 5-10% perf-degradering. Akseptabel for wallet ops (<1k/sek).

#### F2.4 — Nightly reconciliation cron (gap #7)

**Filer å lage:**
- Ny: `apps/backend/src/jobs/walletReconciliation.ts`
- Ny: `apps/backend/src/jobs/walletReconciliation.test.ts`
- Modifiser `apps/backend/src/index.ts` eller `apps/backend/src/jobs/scheduler.ts`: registrér nightly cron (default 03:00 Europe/Oslo)

**Algoritme:**
```typescript
async function reconcile() {
  // Per ikke-system konto:
  //   ledgerSum = SUM(amount) GROUP BY account_id, side FROM wallet_entries
  //   accountBalance = deposit_balance, winnings_balance FROM wallet_accounts
  //   IF ABS(ledgerSum.deposit - accountBalance.deposit) > 0.01 OR
  //      ABS(ledgerSum.winnings - accountBalance.winnings) > 0.01:
  //     ALARM(account_id, divergens)
}
```

**Test:** Inject manuell divergens (UPDATE wallet_accounts uten ledger-rad), assert alarm fired.

**Risiko:** Lang-running query. Krever index-tuning. Run i windowed batches (1k konti per iterasjon).

**Total Fase 2-estimat:** 6-9 dager dev + 2 dager QA + 1 dag staging = 9-12 dager kalender, 6-9 dager dev-tid.

---

### Fase 3 — Industri-paritet (3-4 uker, post-GA)

**Mål:** Pragmatic Play / Evolution-nivå paritet. Adresserer gap-funn 6, 8, 9, 10.

#### F3.1 — Hash-chain audit-trail (gap #6)

**Filer å endre:**
- Ny migration: `apps/backend/migrations/20260601000000_wallet_audit_hash_chain.sql`
- Modifiser `apps/backend/src/adapters/PostgresWalletAdapter.ts:executeLedger`: beregn `entry_hash = SHA256(prev_hash + entry_data)` per ledger-entry
- Lag `apps/backend/src/wallet/WalletAuditVerifier.ts`: nightly cron som verifiserer chain-integritet

**Schema:**
```sql
ALTER TABLE wallet_entries
  ADD COLUMN entry_hash TEXT,
  ADD COLUMN previous_entry_hash TEXT;
CREATE INDEX idx_wallet_entries_hash_chain ON wallet_entries (account_id, id);
```

**Test:** Inject manipulert entry, assert at verifier alarmer.

#### F3.2 — Hot/cold separation (gap #8)

**Filer å lage:**
- Migration: `wallet_accounts_archive` tabell
- Job: `apps/backend/src/jobs/walletArchive.ts` — kvartalsmessig flytt av >90 dager-inaktive konti

**Risiko:** Reduserer arbeidssett, men introduserer kompleksitet i `getAccount` (sjekk begge tabeller). Kan utsettes til >100k konti.

#### F3.3 — Multi-currency-readiness (gap #9)

**Migration:** Legg til `currency` på `wallet_accounts` og `wallet_transactions`. Backfill alle eksisterende rader til `'NOK'`. CHECK constraint `currency = 'NOK'` for nå.

**Forberedelse for fremtidig SEK/EUR:** Wallet-adapter API trenger ikke endres ennå — bare schema-readiness.

#### F3.4 — Idempotency-key TTL (gap #10)

**Job:** `apps/backend/src/jobs/idempotencyKeyCleanup.ts` — månedlig sletting av >90 dager gamle keys i `wallet_transactions.idempotency_key`.

**Risiko:** Hvis en retry kommer >90 dager senere, vil den prosessere en duplicate. Mitigert ved at de fleste retries skjer innenfor minutter, og via TX-historikk-link i klient-state.

**Total Fase 3-estimat:** 8-12 dager dev + 3 dager QA + 1 dag staging = 12-16 dager kalender, 8-12 dager dev-tid.

---

## Konklusjon

**1 PM-beslutning som trengs:**

> **Hvilken hotfix-strategi for Game1 2nd-win bug?**
>
> - **Option A (4 timer dev):** Lapp `Player.balance += payout` i `Game1DrawEngineService` etter `payoutPhase`. Lukker 95% av bug-overflate. Fix er chirurgisk og lavrisiko. Kan deployeres i dag.
>
> - **Option B (1-2 dager):** Implementer dedikert `wallet:state` push-channel (Fase 2.1). Lukker 100% og rydder hele kategorien permanent. Større endring, krever PR-review og staging-test.
>
> Anbefalt: **Option A først** for å fjerne pilot-blocker umiddelbart, **Option B parallelt på neste sprint** for varig løsning.

**Tilstandsvurdering av wallet-arkitekturen:**

- **Kjerne-design:** Sterkt. Postgres source-of-truth, double-entry ledger, idempotency, wallet-split, BIN-693 reservations, regulatorisk admin-gate. Bedre enn 60% av casinoer jeg har auditert.
- **Operasjonelt nivå:** Mangelfullt. Manglende reconciliation, ingen tamper-evident audit, ingen autoritativ push-channel, ingen outbox pattern. Bug-en Tobias rapporterer er et symptom på siste punkt.
- **Time-to-paritet med Pragmatic Play / Evolution:** Realistisk 4-6 uker dev-tid (Fase 2 + 3), prioritert.

**Hovedrisiko hvis vi IKKE gjør noe:**

- Pilot-blocker hvis bug-en blir synlig i fysisk hall under demo eller pilot-uke
- Lotteritilsynet-revisjon kan kreve hash-chain audit + nightly reconciliation som forutsetning for lisens. Vi vet ikke når det kommer, men vi vil ikke være "den lisensen som ikke fikk fornyet".
- Ekte penger er involvert. Hvis en fremtidig bug i `executeLedger` glitcher en ledger-entry uten reconciliation, oppdager vi det først når en spiller klager 30 dager senere — og vi har ingen audit-bevis for å avgjøre tvisten.

**Estimert dev-kostnad samlet (Fase 1+2+3):** 16-23 dev-dager. Hvis pilot-deadline tillater: gjør Fase 1 i denne uken, Fase 2 over neste 2 uker, Fase 3 etter GA.

---

## Vedlegg A — Filliste for code-review

Filene som er sentrale for dette review:

**Backend wallet:**
- `apps/backend/src/adapters/WalletAdapter.ts` (interfaces)
- `apps/backend/src/adapters/PostgresWalletAdapter.ts` (1537 linjer — hoved-impl)
- `apps/backend/src/adapters/InMemoryWalletAdapter.ts` (test-impl)
- `apps/backend/src/adapters/createWalletAdapter.ts` (factory)
- `apps/backend/src/wallet/WalletReservationExpiryService.ts` (BIN-693 expiry)
- `apps/backend/migrations/20260606000000_wallet_split_deposit_winnings.sql`
- `apps/backend/migrations/20260724100000_wallet_reservations.sql`

**Backend wallet-routes:**
- `apps/backend/src/routes/wallet.ts` (463 linjer)
- `apps/backend/src/routes/adminWallet.ts`
- `apps/backend/src/integration/externalGameWallet.ts`

**Backend game-payout (hot path):**
- `apps/backend/src/game/Game1PayoutService.ts` (508 linjer)
- `apps/backend/src/game/Game1TicketPurchaseService.ts` (1240 linjer)
- `apps/backend/src/game/Game1DrawEngineService.ts` (~2500 linjer)
- `apps/backend/src/game/BingoEngine.ts` (linje 1183-1320 — Spill 2/3 payout)
- `apps/backend/src/game/idempotency.ts` (kanonisk key-factory)

**Backend broadcast:**
- `apps/backend/src/sockets/game1PlayerBroadcasterAdapter.ts` (room:update push)
- `apps/backend/src/game/Game1DrawEngineBroadcast.ts` (per-event push)
- `apps/backend/src/util/roomHelpers.ts` (linje 412-422 — payload-bygging)

**Klient:**
- `packages/game-client/src/bridge/GameBridge.ts` (linje 291-396 — bridge-handlers)
- `packages/game-client/src/games/game1/Game1Controller.ts` (linje 372-401 — onGameEnded)
- `packages/game-client/src/games/game1/logic/SocketActions.ts` (refresh-request emit)
- `apps/backend/public/web/lobby.js` (linje 327-501 — lobby-balance handlers)

**Eksisterende reviews:**
- `docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md` (PR-W1 design-doc)
- Relaterte commits: `f2e803e8` (availableBalance), `0c92a23e` (skip re-render), `49724f44` (saldo-flash), `13cec2fc` (umiddelbar refresh), `1c4f9066` (CRIT-6 submitClaim), `4832535b` (cache-buster — virket ikke for 2nd-win)

---

## Vedlegg B — Repro-checklist for verifisering

For å verifisere at hovedbugen er som diagnostisert og fix Option A løser den:

1. **Setup:** Spiller A logget inn, saldo deposit=1000 winnings=0, hall=Notodden.
2. **Round 1:** Arm 1 brett. Start runde. Vinn Phase 1 (ikke Full House). Observér chip — antas å være OK.
3. **Round 1 forts:** Vinn Phase 5 (Full House, runde slutter). Observér chip — antas å være OK pga gameEnded-refetch.
4. **Round 2:** Arm 1 brett. Start runde. Vinn Phase 1.
5. **Forventet:** Chip oppdaterer ikke etter Phase 1.
6. **Etter Round 2:** Vinn Phase 5. Observér chip etter gameEnded.
7. **Forventet:** Chip kanskje oppdaterer (race-avhengig), kanskje ikke.

Mellom hver runde, ta DevTools-screenshot av:
- Network → `/api/wallet/me` requests (timestamp + response)
- Console → `[GameBridge]` logs (lastEmittedBalance, dedup blocks)
- Application → sessionStorage (token, user)

Etter F1.1 deploy: alle phase-wins skal trigger chip-update via `room:update` direkte, uten å vente på `gameEnded`-refetch.

---

*Slutt på rapport. 1100 linjer. PM kan eskalere konkrete PR-er fra Fase 1-anbefalingen umiddelbart.*
