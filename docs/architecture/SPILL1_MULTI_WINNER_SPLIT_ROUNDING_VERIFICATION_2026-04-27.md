# Spill 1 — Multi-Winner Split-Rounding Verification

**Dato:** 2026-04-27
**Status:** Regulatorisk verifisering. Pilot ~6 uker unna.
**Branch:** `verify/spill1-multi-winner-split-rounding`
**Test-suite:** `apps/backend/src/game/Game1MultiWinnerSplitRounding.test.ts` (11 tester, alle grønne)

## TL;DR — pilot-vurdering

| Område | Status | Risiko for pilot |
|---|---|---|
| Engine ad-hoc path (Spill 2/3 / Spillorama) | OK — split per UNIK spiller | Ingen |
| Scheduled-path (Spill 1) — alle spillere har LIKT antall bonger | OK — sluttsum og audit-shape korrekt | Ingen |
| Scheduled-path — ULIKT antall vinnerbonger per spiller | **🚨 REGULATORISK BUG**: spillere med flere bonger får urettferdig stor andel | **HØY** — pilot-blokker |
| Scheduled-path — én spiller, flere bonger samme fase | Sluttbeløp riktig (100 kr), men 2 ledger-entries i stedet for 1 | Lav (audit-shape) |
| Idempotency-protection (re-eval) | OK — wallet-key + phase_winners UNIQUE blokkerer dobbel-credit | Ingen |
| Capital-konservering (Σcredits + houseRest = totalPrize) | OK — verifisert for 1, 2, 3, 7, 11, 13 vinnere | Ingen |

**🚨 KRITISK FUNN (Test #6b):** Når flere spillere vinner samme fase med ULIKT antall vinnerbonger, fordeles premien IKKE per UNIK spiller (slik §3 i `SPILL1_VINNINGSREGLER.md` krever). I stedet splittes premien per BONG. Konsekvens:

> Eksempel: 100 kr fase-premie. Spiller A har 2 vinnerbonger, Spiller B har 1 vinnerbong.
> - **§3 (regulatorisk korrekt):** A = 50 kr, B = 50 kr.
> - **DAGENS (BUG):** A = 66.66 kr, B = 33.33 kr.

Dette er et **regulatorisk pilot-blokker** og må fikses før første hall går live. Engine ad-hoc path (Spill 2/3) er IKKE påvirket — kun Spill 1 scheduled-path.

## Endringer i koden

Ingen produksjonskode er endret. Kun ny test-fil.

## Q1-Q4 status

### Q1 — Samme spiller med 2 bonger som vinner samtidig: ÉN andel?

**Spec (kilde-sannhet):** `docs/operations/SPILL1_VINNINGSREGLER.md` §3 (skrevet 2026-04-27):
> "Spilleren teller likevel som ÉN vinner — gevinsten splittes per UNIK spiller, ikke per bong."

**Engine ad-hoc path** (`BingoEnginePatternEval.detectPhaseWinners` flat-grenen, L671-682):
```typescript
const flatIds = new Set<string>();
for (const [playerId, tickets] of game.tickets) {
  for (let i = 0; i < tickets.length; i += 1) {
    if (meetsPhaseRequirement(activePattern, tickets[i], drawnSet)) {
      flatIds.add(playerId);
      break;        // ← bryter etter første vinnerbong, så samme spiller telles én gang
    }
  }
}
```
**Status:** ✅ Korrekt. Verifisert av eksisterende `BingoEngine.splitRoundingLoyalty.test.ts` PR5-suite (alle 7 tester grønne 2026-04-27).

**Scheduled-path** (`Game1DrawEngineService.evaluatePatternsAndPayout`, L1951-1981):
```typescript
const winners: Array<Game1WinningAssignment & { userId: string }> = [];
for (const row of rows) {
  // ... per-assignment evaluation
  if (eval_.isWinner) {
    winners.push({ assignmentId, walletId, userId, hallId, ticketColor });
  }
}
// PR 4d.4: dedupliser winnerIds (én spiller kan ha flere tickets som vinner samtidig)
const winnerIds = Array.from(new Set(winners.map((w) => w.userId)));
```

`winnerIds` (= unike spillere) brukes til BROADCAST. `winners` (= per-bong) sendes uendret inn til `Game1PayoutService.payoutPhase`, hvor `winnerCount = input.winners.length` (= bong-antall) blir split-divisor.

**Konsekvens (to scenarioer):**

**Scenario 1: Alle vinnere har LIKT antall bonger** (Test #5/#6):
- spilleren med 2 vinnerbonger får 2 credits à `prize/winners.length` til samme wallet.
- TOTAL sluttsum per spiller er korrekt (2 × prize/N = riktig fordeling fordi N grupperer multiplum).
- Bug-shape: 2 ledger-entries i stedet for 1.

**Scenario 2: Vinnere har ULIKT antall bonger** (Test #6b — KRITISK):
- 100 kr på 3 bonger fordelt 2+1 mellom 2 spillere → A = 66.66, B = 33.33.
- §3 krever: A = 50, B = 50 (likt per UNIK spiller).
- 🚨 **Sluttbeløp per spiller er FEIL** — regulatorisk pilot-blokker.

**Status:** 🚨 **Scenario 2 = pilot-blokker.** Scenario 1 = audit-shape-avvik (lav prioritet).

### Q2 — Floor-rounding, audit-trail for hus-rest

**Spec:** §3.7 i SPILL1_VINNINGSREGLER.md krever floor-division med rest til hus + `HOUSE_RETAINED` audit-event.

**Implementasjon** (`Game1PayoutService.payoutPhase`, L204-232):
```typescript
const prizePerWinnerCents = Math.floor(input.totalPhasePrizeCents / winnerCount);
const houseRetainedCents = input.totalPhasePrizeCents - winnerCount * prizePerWinnerCents;
if (houseRetainedCents > 0) {
  this.splitRoundingAudit.onSplitRoundingHouseRetained({ amount: centsToKroner(houseRetainedCents), ... });
}
```

**Status:** ✅ Korrekt. Test #3 (3 vinnere på 200 kr → 66.66 hver, rest 0.02 til hus, audit logget). Test #11 verifiserer kapital-konservering for 6 ulike winner-counts (1, 2, 3, 7, 11, 13).

### Q3 — Per-color path: separate split-pools per farge

**Implementasjon** (`Game1DrawEngineService.payoutPerColorGroups`, L2224-2289):
```typescript
const groups = new Map<string, Array<...>>();
for (const w of winners) groups.get(w.ticketColor)!.push(w);
for (const [color, groupWinners] of groups.entries()) {
  await this.payoutService.payoutPhase(client, { totalPhasePrizeCents: ..., winners: groupWinners, ... });
}
```

**Status:** ✅ Korrekt. Hver farge har egen split-pool. Spiller med bonger i flere farger får én credit per farge. Test #7 verifiserer end-to-end med Yellow (3 vinnere) + Green (2 vinnere) → 5 unike credits.

### Q4 — Idempotency-protection

**Implementasjon (to-lags):**

1. **Wallet-adapter idempotency-key** (`Game1PayoutService.payoutPhase`, L253-257):
   ```typescript
   idempotencyKey: IdempotencyKeys.game1Phase({
     scheduledGameId: input.scheduledGameId,
     phase: input.phase,
     assignmentId: winner.assignmentId,
   }),
   // Format: g1-phase-{scheduledGameId}-{phase}-{assignmentId}
   ```
   Outbox-mønster (BIN-761) garanterer én ledger-entry per nøkkel uavhengig av antall `credit()`-kall.

2. **Phase_winners UNIQUE constraint** (`Game1PayoutService.payoutPhase`, L290-313):
   ```sql
   INSERT INTO app_game1_phase_winners (...)
   VALUES (...)
   ON CONFLICT (scheduled_game_id, phase, assignment_id) DO NOTHING
   ```

**Status:** ✅ Korrekt. Test #9 simulerer wallet-adapter med `duplicateIdempotencyReturnsExisting=true` og verifiserer at re-eval ikke produserer flere credits eller dobler utbetaling. Beskyttelse holder i begge lag.

**Engine ad-hoc path** bruker tilsvarende `IdempotencyKeys.adhocPhase({patternId, gameId, playerId})` — playerId i nøkkelen, så samme spillers re-eval er idempotent.

## Test-resultater

```
$ npx tsx --test src/game/Game1MultiWinnerSplitRounding.test.ts

✔ multi-winner-split #1: 1 vinner får full premie 200 kr → 0 rest
✔ multi-winner-split #2: 2 unike spillere samme ball → 200/2 = 100 hver, 0 rest
✔ multi-winner-split #3: 3 unike spillere på 200 kr → floor(200/3)=66, rest 2 kr til hus + audit
✔ multi-winner-split #4: 4 unike spillere på Fullt Hus 1000 kr → 250 hver, 0 rest
✔ multi-winner-split #5: 1 spiller med 2 bonger samtidig → SKAL få 1 andel (per UNIK spiller)
✔ multi-winner-split #6: 2 spillere × 2 bonger → 4 split-andeler (DAGENS) eller 2 (forventet per §3)
✔ multi-winner-split #6b: KRITISK BUG — Player A med 2 bonger + Player B med 1 bong   ← REGULATORISK PILOT-BLOKKER
✔ multi-winner-split #7: per-color path — to farger har separate split-pools
✔ multi-winner-split #8: 4 vinnere på Fullt Hus 1000 kr fast premie → 250 hver, hus dekker hvis pool < 1000
✔ multi-winner-split #9: Idempotency — wallet-adapter idempotency-key blokkerer dobbel-credit ved retry
✔ multi-winner-split #10 (edge): 0 vinnere → DomainError(PAYOUT_NO_WINNERS)
✔ multi-winner-split #11: Σ(credits) + houseRetained = totalPhasePrize (regulatorisk invariant)

ℹ tests 12
ℹ pass 12
ℹ fail 0
```

Alle tester PASSER fordi de LÅSER eksisterende oppførsel for å dokumentere den. Test #6b vil måtte oppdateres når fix lander (forventet output: 50/50 i stedet for 66.66/33.33).

## Identifiserte avvik (pri-ordnet)

### 🚨 KRITISK (pilot-blokker) — split per UNIK spiller ikke implementert i scheduled-path

**Sted:** `apps/backend/src/game/Game1DrawEngineService.ts:1981` + `Game1PayoutService.ts:205-208`

**Symptom:** Når flere spillere vinner samme fase med ULIKT antall vinnerbonger, fordeles premien per BONG i stedet for per UNIK SPILLER. Spillere med flere bonger får uforholdsmessig stor andel.

**Reproduksjon:** Test #6b — 100 kr fase-premie, 3 vinnerbonger fordelt 2+1 mellom 2 spillere → A = 66.66, B = 33.33 (skulle vært 50+50 per §3).

**Hvorfor:** `evaluatePatternsAndPayout` på L1951-1981 bygger `winners`-array per assignment (én rad per bong fra `app_game1_ticket_assignments`). Den dedupliserer `winnerIds` for broadcast-bruk men sender uendret `winners`-array inn til `payoutPhase`. Servicen bruker `winners.length` (= bong-antall) som split-divisor.

**Engine ad-hoc path er IKKE påvirket** — `BingoEnginePatternEval.detectPhaseWinners` bygger `Set<playerId>` med `flatIds.add(playerId); break` (L671-682), så samme spiller telles én gang.

**Anbefalte fix-strategier:**

- **Alternativ A (anbefalt):** I `Game1DrawEngineService.evaluatePatternsAndPayout`, kollapse `winners`-arrayet til én entry per `(userId, hallId, ticketColor)` FØR `payoutPhase`-kall. Beholder representativ `assignmentId` (f.eks. første) i hovedraden. Andre `assignmentId`-verdier kan persistere i et `additionalAssignmentIds`-felt for full audit-sporbarhet, eller via separat `app_game1_phase_winner_assignments`-tabell.

- **Alternativ B:** Endre `Game1PayoutService.payoutPhase` til å gruppere `input.winners` per `userId` (eller `(userId, ticketColor)` for per-color-path) før split, deretter kreditere én gang per gruppe. Beholder `phase_winners`-rader per assignment for audit.

- **Alternativ C (ikke-fix):** Akseptér per-bong-split som regulatorisk-godkjent, oppdater `SPILL1_VINNINGSREGLER.md` §3 til å presisere "per BONG". Krever konsultasjon med Lotteritilsynet.

**Pilot-vurdering:** PILOT-BLOKKER. Må adresseres. Tester #5/#6/#6b LÅSER eksisterende oppførsel — vil feile etter fix og må oppdateres for å forvente §3-korrekt distribusjon.

### Lav prioritet — én spiller med flere bonger har 2 ledger-entries i stedet for 1

**Symptom:** Når én spiller har 2 vinnerbonger samme fase, mottar de TOTAL korrekt premie (begge bonger × `prize/2` = `prize`), men det opprettes 2 wallet-credits + 2 `phase_winners`-rader + 2 audit-events i stedet for 1.

**Konsekvens for pilot:** Ingen — sluttbeløp matematisk korrekt. Men audit-trail er per-bong i stedet for per-vinner per §3.

**Anbefaling:** Adresseres av samme fix som hovedbuggen ovenfor.

### Ingen andre avvik funnet

## Anbefalinger for pilot

1. 🚨 **PILOT-BLOKKER:** Fiks `Game1DrawEngineService.evaluatePatternsAndPayout` slik at split skjer per UNIK spiller, ikke per BONG. Se "Identifiserte avvik" §1 for tre fix-strategier (Alt A/B/C). Estimert 1-2 dev-dager for Alt A.
2. ⚠️ **Q1-§3-formuleringen må presiseres** med PM før fix lander, slik at `phase_winners`-tabellen og audit-events får riktig shape.
3. 🟢 **Idempotency-protection er bombesikker.** Outbox + UNIQUE-constraint i to lag — re-eval ved restart eller race fører ikke til dobbel utbetaling. Verifisert av Test #9.
4. 🟢 **Capital-konservering er verifisert for 1, 2, 3, 7, 11, 13 vinnere.** Σ(credits) + houseRetained = totalPhasePrize alltid (Test #11).
5. 🟢 **Engine ad-hoc path (Spill 2/3 / Spillorama) er korrekt** — `detectPhaseWinners` flat-grenen og per-color-grenen håndterer split per UNIK spiller. Ingen fix-behov der.
6. 🟢 **Per-color path (Spill 1, separate split-pools per farge)** er verifisert OK (Test #7).

## Filer

| Fil | Endring |
|---|---|
| `apps/backend/src/game/Game1MultiWinnerSplitRounding.test.ts` | NY — 11 regresjonstester |
| `docs/architecture/SPILL1_MULTI_WINNER_SPLIT_ROUNDING_VERIFICATION_2026-04-27.md` | NY — denne rapporten |

Ingen produksjonskode er endret. Verifiserings-PR uten regresjons-risiko.

## Referanser

- Spec: `docs/operations/SPILL1_VINNINGSREGLER.md` §3 (Multi-winner split, multi-bong per spiller)
- Engine path: `apps/backend/src/game/BingoEnginePatternEval.ts` L651-711 (`detectPhaseWinners`)
- Engine payout: `apps/backend/src/game/BingoEngine.ts` L1422-1614 (`payoutPhaseWinner`)
- Scheduled path: `apps/backend/src/game/Game1DrawEngineService.ts` L1858-2160 (`evaluatePatternsAndPayout`)
- Scheduled payout: `apps/backend/src/game/Game1PayoutService.ts` L173-471 (`payoutPhase`)
- Idempotency: `apps/backend/src/game/idempotency.ts` L52-57 (`game1Phase`), L162-167 (`adhocPhase`)
- Eksisterende engine-tester: `apps/backend/src/game/BingoEngine.splitRoundingLoyalty.test.ts` PR5-suite
- Eksisterende per-color-tester: `apps/backend/src/game/BingoEngine.perColorPatterns.test.ts`
- Eksisterende payout-service-tester: `apps/backend/src/game/Game1PayoutService.test.ts`
