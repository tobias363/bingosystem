# Unified Pipeline Refactor — Design Document

**Dato:** 2026-04-28
**Status:** Design-utkast (forventer Tobias-godkjenning før implementasjon)
**Forfatter:** PM-koordinator etter 5 code reviews + 23 PR-er + bug-rapporter på dagen
**Trigger:** Tobias-direktiv 2026-04-27: "Vi må få kontroll på denne funksjonen, virker som at 1 ting blir fikset og en annen blir broken. Må vi bygge det opp anderledes eller stykke opp mer slik at man har full kontroll på hva hver enkelt funksjon gjør"

---

## 1. Executive Summary

Spillorama-backend har de siste 2 ukene mistet "fix-confidence": én fix breaker en annen. Symptomene er konsekvente, ikke tilfeldige. Diagnosen er **strukturell**, ikke kvalitativ — hver enkelt fix er korrekt, men arkitekturen tillater ikke endringer å treffe alle relevante kode-stier samtidig.

### Konkret diagnose

- **`BingoEngine.ts` er 4285 linjer** — én enkelt fil, multiple ansvar.
- **`Game1DrawEngineService.ts` er 116KB / ~3000 linjer** — duplisert engine-logikk for "scheduled-flyt".
- **Two parallelle execution-paths** (per Code Review #2): scheduled-flyt vs ad-hoc-engine. Bugs i én treffer sjelden den andre.
- **Multiple call-sites** for samme operasjon (e.g. 3 paths for `engine.createRoom` med `isTestHall`-propagation).
- **3300-linjer service-er** som blander wallet, compliance, audit, socket-emit, og DB-state i samme funksjon.

### Foreslått løsning

Én **unified pipeline** der scheduled + ad-hoc går gjennom SAMME funksjons-kjede, med klare module-boundaries og narrow ports. Hver modul har én jobb. Endringer treffer ALLE flytene automatisk.

### Estimat

- **MVP-refactor:** 5-8 dev-dager
- **Full extraction til ports + adapters:** 2-3 uker
- **Pilot kan demonstreres** etter MVP — den fjerner ~50% av kjente P0-funn

### ROI

| Uten refactor | Med refactor |
|---|---|
| 23 PR-er på 24 timer + nye bugs | 6-8 PR-er, færre regressioner |
| Hver fix krever 3 call-site-traversals | Én fix → alle stier oppdatert |
| 35 P0 etter 5 reviews | ~15 P0 (ad-hoc-asymmetri eliminert) |
| Whack-a-mole-mønster fortsetter | Stabil baseline for pilot-demo |

---

## 2. Detaljert Diagnose

### 2.1 Filer over 1500 linjer

| Fil | LOC | Ansvar (overlapper) |
|---|---|---|
| `BingoEngine.ts` | 4285 | Draw, claim, wallet, audit, lifecycle, mini-games, jackpot |
| `Game1DrawEngineService.ts` | ~3000 | Scheduled draw, payout, auto-pause, multi-hall, recovery |
| `Game1MasterControlService.ts` | ~1700 | Master coordination, ready-state, transfer |
| `Game1TicketPurchaseService.ts` | ~1300 | Ticket purchase, wallet reserve, compliance ledger |
| `roomEvents.ts` | ~1000 | Socket room lifecycle, canonical routing, auth |

**Konsekvens:** Cognitive overload. Ingen utvikler kan holde hele filen i hodet samtidig.

### 2.2 Konkrete whack-a-mole-eksempler fra denne uken

| PR | Bug fikset | Bug introdusert |
|---|---|---|
| #643 | Auto-pause etter Phase 1 (UX) | Test-haller pauset også → BIN-FOLLOWUP |
| #660 | Demo Hall ikke ende på Fullt Hus | `isTestHall` ikke wired til alle 3 socket-paths |
| #671 | `isTestHall` propagering | Manglet i `attachPlayerSocket` → fortsatt pause |
| #677 | Canonical-aware lookup | Stale `4RCQSX`-rom fra før fix beholdt → pilot-blokker |
| #682 | Boot-sweep + admin clear-stuck | (potensielt) no-winnings regresjon |

**Mønster:** Hver fix krever endring i 3-5 forskjellige call-sites, og det er ALLTID minst én som glipper.

### 2.3 Dual execution-path (per Code Review #2)

Spill 1 har TO fullt separate kode-stier:

```
SCHEDULED-FLYT (production):
  game1ScheduledEvents.ts
    → Game1DrawEngineService.startGame
    → Game1DrawEngineService.drawNext
    → Game1PayoutService.payoutPhase
    → Outer DB-tx → atomisk

AD-HOC-FLYT (Demo Hall, test, BIN-694 auto-claim):
  roomEvents.ts → engine.startGame
    → BingoEngine.drawNextNumber
    → BingoEnginePatternEval.evaluateActivePhase
    → BingoEngine.payoutPhaseWinner (ingen outer-tx)
```

**Resultat:** Bugs i ad-hoc-flyten blir oppdaget på Demo Hall (slik som denne uken), mens scheduled-flyt er testet i prod.

### 2.4 Compliance-ledger-kall fra 12+ steder

Per Code Review #2 P0-6 + Code Review #5 P0-3:

`recordComplianceLedgerEvent` kalles fra:
- `Game1TicketPurchaseService.ts:625-636` (ticket purchase)
- `Game1PayoutService.ts:419-423` (phase payout)
- `BingoEngineMiniGames.ts:153,326` (mini-game payout)
- `BingoEngine.ts:1436-1628` (ad-hoc payout)
- `Game1JackpotService.ts` (jackpot)
- `Game1LuckyBonusService.ts` (lucky bonus)
- `Game1JackpotStateService.ts` (daily jackpot)
- (5+ andre)

Alle har samme idempotency-bug. Fix må gjentas 12+ steder, ELLER lift up til én sentral point.

---

## 3. Foreslått Arkitektur

### 3.1 Module-boundaries (ports + adapters)

```
┌─────────────────────────────────────────────────────────────┐
│  ENTRY POINTS                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ socketEvents │  │ httpRoutes   │  │ cronJobs     │       │
│  │ (roomEvents, │  │ (adminRooms, │  │ (scheduleTick)       │
│  │  ticketEvents│  │  game1Purch.)│  │              │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                           │                                  │
│  ─────────────────────────┴───────────────────────────────  │
│                                                              │
│  GAME PIPELINE (unified)                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  GameOrchestrator                                     │  │
│  │  - startRound(roomId, options) → GameSession          │  │
│  │  - drawNext(roomId) → DrawResult                      │  │
│  │  - submitClaim(roomId, ticketId) → ClaimResult        │  │
│  │  - pause/resume/end (with audit)                      │  │
│  └────┬───────────┬───────────┬───────────┬─────────────┘  │
│       │           │           │           │                  │
│       ▼           ▼           ▼           ▼                  │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐      │
│  │Drawing │ │PatternE │ │ Payout   │ │  Lifecycle   │      │
│  │Service │ │valSvc   │ │ Service  │ │  Service     │      │
│  └────┬───┘ └────┬────┘ └────┬─────┘ └────┬─────────┘      │
│       │          │            │            │                 │
│  ─────┴──────────┴────────────┴────────────┴───────────────│
│                                                              │
│  PORTS (interfaces)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ WalletPort│ │CompliPort│ │ AuditPort│ │ HallPort │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │            │            │            │              │
│  ─────┴────────────┴────────────┴────────────┴────────────│
│                                                              │
│  ADAPTERS (DB / external)                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ PostgresWlt  │ │ ComplianceDB │ │ AuditLogDB   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Service-extraksjon (med konkrete LOC-budgets)

| Ny modul | Erstatter | Maks LOC | Ansvar |
|---|---|---|---|
| `DrawingService` | Deler av BingoEngine | 400 | Ball-uttrekk, drawBag, trekkings-checkpoint |
| `PatternEvalService` | BingoEnginePatternEval | 600 | Phase-detection, multi-winner-split, recursion |
| `PayoutService` | BingoEngine.payoutPhase + Game1PayoutService | 500 | Wallet + ledger + audit triple, ATOMISK |
| `LifecycleService` | Lifecycle-deler | 300 | startRound, pauseGame, resumeGame, endGame |
| `MasterCoordinationService` | Game1MasterControlService + Game1HallReadyService | 600 | Multi-hall ready, transfer, master-start-guards |
| `MiniGameService` | BingoEngineMiniGames + Game1MiniGameOrchestrator | 500 | Wheel/Treasure/Mystery rotation + payout |
| `JackpotService` | Game1JackpotService + Game1JackpotStateService | 400 | Daily jackpot accumulation + Free-Spin-prize |
| `RoomLifecycleService` | Deler av roomEvents.ts | 400 | createRoom, joinRoom, canonical-resolution |
| `**GameOrchestrator**` | (NY toppnivå) | 500 | Wires alle services sammen, eksponerer single API |

**Total LOC:** ~4200 (matcher gammel BingoEngine, men distribuert + testbart).

### 3.3 Single execution-path

Alle entry-points (socket, REST, cron) kaller **samme `GameOrchestrator`**. Ingen dual paths.

```typescript
// BEFORE (dual paths):
// scheduledFlow → Game1DrawEngineService.drawNext (atomic)
// adHocFlow → BingoEngine.drawNextNumber (not atomic)

// AFTER (unified):
async function drawNext(roomId: string): Promise<DrawResult> {
  return await this.orchestrator.drawNext(roomId);
  // GameOrchestrator selv velger atomisk vs non-atomic basert på room-config
  // (test-rom kan kjøre ikke-atomisk for hastighet, prod ALLTID atomisk)
}
```

### 3.4 Narrow ports (interfaces)

Hver service tar ports som parametere:

```typescript
interface WalletPort {
  reserve(walletId: string, amount: number, key: string): Promise<Reservation>;
  commit(reservationId: string): Promise<Transaction>;
  credit(walletId: string, amount: number, key: string): Promise<Transaction>;
}

interface CompliancePort {
  recordEvent(event: ComplianceEvent, idempotencyKey: string): Promise<void>;
  // idempotencyKey UNIQUE-constraint enforces på DB-nivå
}

interface AuditPort {
  log(event: AuditEvent): Promise<void>;
}
```

**Konsekvens:** Tester kan injisere `InMemoryWalletPort` for hastighet. Prod bruker `PostgresWalletPort`. Ingen `if (test)`-grener i forretningslogikk.

### 3.5 Atomicity-pattern

Hver write-operasjon i `PayoutService` wraps i ÉN transaksjon:

```typescript
async function payoutPhase(roomId, phase, winners): Promise<PayoutResult> {
  return await this.db.transaction(async (client) => {
    // 1. Wallet credits
    for (const winner of winners) {
      await this.walletPort.credit(client, winner.walletId, phase.prize, idempotencyKey(winner));
    }
    // 2. Compliance ledger (UNIQUE-key)
    for (const winner of winners) {
      await this.compliancePort.recordEvent(client, prizeEvent(winner), key(winner));
    }
    // 3. Audit log
    await this.auditPort.log(client, payoutAuditEvent);
    // 4. Game state
    await this.gameStorePort.markPhaseWon(client, roomId, phase, winners);
    // ALLE eller INGEN.
  });
}
```

### 3.6 Invariant-enforcement på DB-nivå

DB-constraints fanger bugs som tester ikke fanger:

```sql
-- compliance ledger
ALTER TABLE app_rg_compliance_ledger
  ADD CONSTRAINT idempotency UNIQUE(idempotency_key);

-- agent transactions
ALTER TABLE app_agent_transactions
  ADD CONSTRAINT cash_idempotency UNIQUE(agent_user_id, player_user_id, client_request_id);

-- wallet
ALTER TABLE app_wallet_transactions
  ADD CONSTRAINT wallet_idempotency UNIQUE(wallet_id, idempotency_key);

-- room canonical
CREATE UNIQUE INDEX rooms_canonical
  ON app_rooms (canonical_code) WHERE deleted_at IS NULL;
```

DB-en avviser duplikater før kode kjører.

---

## 4. Migration Plan (Incremental, Safe)

### Fase 0: Forberedelse (1-2 dev-dager)

- [ ] Definer alle ports (interfaces) i `apps/backend/src/ports/`
- [ ] Skriv invariant-tester (property-based) FØR refactor:
  - Wallet-balance er aldri negativ
  - Compliance-ledger har UNIQUE per event-key
  - Phase-payout summerer til eksakt beløp (1700 kr Norsk Bingo)
  - Multi-winner split er rounding-korrekt
- [ ] Lag `GameOrchestrator`-skall (kall eksisterende kode internt)

### Fase 1: PayoutService extraction (2 dev-dager)

- [ ] Lag `PayoutService` som bruker ports
- [ ] ÉN funksjon: `payoutPhase(roomId, phase, winners) → atomic`
- [ ] Migrér ALLE 12+ compliance-ledger-call-sites til denne ene
- [ ] Tester:
  - Atomicity (rollback ved feil i hvilken som helst step)
  - Idempotency (retry skriver ikke duplikater)
  - Multi-winner split-rounding

### Fase 2: DrawingService extraction (1 dev-dag)

- [ ] Lag `DrawingService` med drawNext/drawBag-state
- [ ] Migrér checkpoint-pattern
- [ ] Tester invariant: drawn ≤ maxDraws

### Fase 3: PatternEvalService extraction (1 dev-dag)

- [ ] Lag `PatternEvalService` med evaluateActivePhase
- [ ] Fjern dual scheduled/ad-hoc semantikk — én funksjon
- [ ] Tester: 5/5 phase progression, multi-winner, multi-pattern

### Fase 4: GameOrchestrator wires alt (1 dev-dag)

- [ ] Wire alle entry-points (socket, REST, cron) til Orchestrator
- [ ] Slett `Game1DrawEngineService` (scheduled-flyt går gjennom samme orchestrator)
- [ ] Tester: scheduled vs ad-hoc gir samme resultat

### Fase 5: Master coordination + room lifecycle (2 dev-dager)

- [ ] Extract `MasterCoordinationService`
- [ ] Extract `RoomLifecycleService`
- [ ] Single canonical-routing entry-point

### Fase 6: Cleanup + dokumentasjon (1 dev-dag)

- [ ] Fjern dead code i BingoEngine.ts (skal være ~500 linjer igjen som thin façade)
- [ ] Skriv ARCHITECTURE.md med diagram
- [ ] Update CONTRIBUTING.md med "én service = én jobb"-regel

**Total:** 8-10 dev-dager kalender. ~14-18 dev-timer hvis 2 agenter kjører parallelt.

---

## 5. Test-strategi

### 5.1 Property-based invariants (kjører på hver PR)

```typescript
// Eks: wallet-balance-invariant
test.property("wallet balance never negative after any operation", () => {
  // Generér tilfeldig sekvens av reserve/commit/credit/debit
  // Verifisér slutt-balanse ≥ 0
});

// Eks: compliance-ledger-completeness
test.property("every wallet payout has matching compliance entry", () => {
  // For hver wallet credit/debit → finn matchende ledger-row
  // Antall skal være likt
});

// Eks: phase-payout-sum
test.property("Norsk Bingo 5-fase total ≤ pool eller fixed-prize", () => {
  // Setup: 10 spillere, 30 brett
  // Run: full 75-ball draw
  // Assert: sum av phase-prizes ≤ totalstake (% ratio) ELLER fixed-prize-cap
});
```

### 5.2 End-to-end flow tests (per release)

Eksisterende E2E-er (#662, #663, #666) beholdes. Etter refactor: scheduled + ad-hoc kjører SAMME orchestrator → én suite dekker begge.

### 5.3 DB-constraint-as-test

UNIQUE-constraints + foreign keys + check-constraints = ekstra test-laget. Migration-suite kjører dem.

---

## 6. Risiko + Mitigeringer

| Risiko | Sannsynlighet | Konsekvens | Mitigering |
|---|---|---|---|
| Refactor introduserer regresjon | Middels | Høy | Property-based invariants kjører på hver PR. Begge gamle paths beholdes til Fase 4 (parallel run + diff) |
| Pilot-demo må utsettes | Høy | Middels | MVP etter Fase 4 (4-5 dager) gir pilot-readyness. Resten kan komme post-pilot |
| Agent-rate-limits | Lav | Lav | Refactor-arbeid er sekvensielt — vi kan jobbe direkte uten parallel-agenter |
| Compliance-tester må oppdateres | Lav | Lav | Flytt 1:1, ingen logikk-endring |

---

## 7. Beslutnings-punkter (Tobias må vedta)

1. **Når starte refactor?**
   - Alt A: Etter Bølge 1-fixes lander (slip pilot 1 uke til)
   - Alt B: Stoppe Bølge 1, refactor først (slip pilot 1-2 uker)
   - Alt C: Refactor parallelt med pilot-test (riskier, men raskere)

2. **MVP-scope?**
   - Minimum: Fase 0 + 1 + 4 (PayoutService + Orchestrator) — 4-5 dager, fjerner ~15 P0
   - Anbefalt: Fase 0-4 — 5-7 dager, fjerner ~25 P0
   - Full: Fase 0-6 — 8-10 dager, fjerner ~30 P0

3. **Hvem skriver invariant-testene?**
   - Code-review-agenter har dokumentert hva som må holdes — kan generere disse
   - Eller manuelt review-pass for å bekrefte

---

## 8. Conclusio

**Whack-a-mole-mønsteret er strukturelt, ikke kvalitativt.** Refactor er ikke nice-to-have — det er det som gjør at neste fix faktisk holder.

**Min anbefaling:**
- Vent på Bølge 1-fixes lander (når rate-limit åpnes 13:00)
- Merge dem (de er ortogonale til refactor — ingen konflikt)
- Start Fase 0 + 1 (PayoutService + invariants) umiddelbart etter
- MVP-refactor klar på ~5 dager
- Pilot-demo etter MVP, IKKE før

**Konsekvens hvis ingen refactor:**
- Hver fremtidig pilot-bug-rapport krever 3-5 PR-er for å adressere alle paths
- 35 P0 vil ikke konvergere — vi legger til nye etter hvert som vi fikser
- Code review-rapporter tilsammen ~3000 linjer som ingen kan internalize

**Konsekvens med refactor:**
- Stabil baseline for pilot
- Fremtidige fixes treffer alle stier
- Code review-funn lukker raskt
- 50% mindre kode totalt (duplisering fjernet)

---

**Neste steg ved Tobias-godkjenning:** Spawn arkitektur-agent for Fase 0 (definere ports + invariant-tests). Estimat: 4 timer.

🤖 Skrevet 2026-04-28 av PM-koordinator etter dyp analyse av 5 code reviews + 24 timers PR-historikk.
