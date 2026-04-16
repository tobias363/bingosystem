# Spill 1 — Kritiske faser: Innsats, kjøp og gevinst

> Denne dokumentasjonen dekker de regulatorisk kritiske fasene i Spill 1 (Databingo).
> Alle pengebeløp er server-autoritative — klienten beregner aldri beløp selv.

---

## Innholdsfortegnelse

1. [Arkitekturprinsipp](#1-arkitekturprinsipp)
2. [Bongkjøp (bet:arm)](#2-bongkjøp-betarm)
3. [Spillstart og lommebokdebitering (game:start)](#3-spillstart-og-lommebokdebitering-gamestart)
4. [Innsatsvisning (StakeCalculator)](#4-innsatsvisning-stakecalculator)
5. [Trekking og markering (draw)](#5-trekking-og-markering-draw)
6. [Claim og gevinstutbetaling (claim:submit)](#6-claim-og-gevinstutbetaling-claimsubmit)
7. [Gevinsttak og policy (PrizePolicyManager)](#7-gevinsttak-og-policy-prizepolicymanager)
8. [Compliance og regulatorisk registrering](#8-compliance-og-regulatorisk-registrering)
9. [Sikkerhetstiltak](#9-sikkerhetstiltak)
10. [Filreferanser](#10-filreferanser)

---

## 1. Arkitekturprinsipp

```
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (source of truth)             │
│                                                         │
│  Wallet debit ← game:start → prize pool                │
│  Prize payout ← claim:submit → compliance ledger       │
│  Player stakes ← room:update → playerStakes{}          │
│                                                         │
│  All monetary calculations happen HERE                  │
└──────────────────────┬──────────────────────────────────┘
                       │ room:update, drawNew, patternWon
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (display only)                │
│                                                         │
│  GameBridge.myStake ← payload.playerStakes[myId]       │
│  StakeCalculator → returns myStake directly             │
│  PlayScreen → shows "Innsats: X kr" or "—"             │
│                                                         │
│  Frontend NEVER calculates monetary amounts              │
└─────────────────────────────────────────────────────────┘
```

**Grunnregel:** Klienten viser kun beløp som serveren har beregnet og sendt.
Ingen `entryFee × priceMultiplier` på klienten — serveren sender `playerStakes`
med ferdig beregnede beløp i `room:update`.

---

## 2. Bongkjøp (bet:arm)

### Flyt

```
Spiller klikker "Kjøp" i popup
    → Frontend: onBuy() callback → Game1Controller.handleBuy()
    → Socket: bet:arm { roomCode, armed: true }
    → Backend: armPlayer(roomCode, playerId)
        → Legger playerId i armedPlayerIdsByRoom Set
        → Sender room:update til alle i rommet
    → Frontend: GameBridge mottar room:update
        → state.isArmed = armedPlayerIds.includes(myPlayerId)
        → state.myStake = playerStakes[myPlayerId]
        → PlayScreen viser "Innsats: X kr"
```

### Viktige detaljer

- **Ingen debitering ved arm.** Lommebok belastes først ved `game:start`.
- **Idempotent.** Å arme en allerede armet spiller er en no-op.
- **Avbestilling.** `bet:arm { armed: false }` → `disarmPlayer()` fjerner fra Set.
- **Server-side auth.** `playerId` hentes fra autentisert token, ikke fra klient-payload.

### Filer

| Fil | Hva |
|-----|-----|
| `Game1BuyPopup.ts` | UI: 3-kolonners grid med +/- per bongtype |
| `PlayScreen.ts` | Delegerer `onBuy()` til controller (ingen direkte socket-kall) |
| `Game1Controller.ts` | `handleBuy()` → `socket.armBet()` → `showBuyPopupResult()` |
| `backend/src/util/roomState.ts` | `armPlayer()`, `disarmPlayer()`, `getArmedPlayerIds()` |

---

## 3. Spillstart og lommebokdebitering (game:start)

### Flyt

```
Scheduler trigger (autoStart) eller manuell start
    → BingoEngine.startGame(input)
    → Validering:
        1. entryFee: 0–10 000 kr, finite
        2. ticketsPerPlayer: 1–30
        3. payoutPercent: eksplisitt satt (ingen default)
    → Filtrering av eligible spillere:
        1. Er armet (armedPlayerIds)
        2. Ikke i annet pågående spill
        3. Ikke blokkert av Spillvett (tidsgrense, selvekskludering)
        4. Har råd (balance >= entryFee)
        5. Ville ikke overstige tapsgrense
    → Debitering (sekvensiell, med refund-failsafe):
        for each eligible player:
            wallet.transfer(player → house, entryFee, {
                idempotencyKey: "buyin-{gameId}-{playerId}"
            })
            compliance.recordLossEntry(BUYIN, entryFee)
            compliance.recordComplianceLedgerEvent(STAKE, entryFee)
        HVIS noen transfer feiler:
            refundDebitedPlayers() for ALLE allerede debiterte
            throw error (spillet starter ikke)
    → Premiepott:
        prizePool = roundCurrency(entryFee × eligible.length)
        maxPayoutBudget = roundCurrency(prizePool × payoutPercent / 100)
    → Bonggenerering, mønster-setup, spill satt til RUNNING
    → disarmAllPlayers(roomCode)
    → room:update broadcast
```

### Idempotency og feilhåndtering

| Scenario | Håndtering |
|----------|-----------|
| Dobbel debitering (retry) | `idempotencyKey: "buyin-{gameId}-{playerId}"` forhindrer |
| Transfer feiler midtveis | `refundDebitedPlayers()` med `idempotencyKey: "refund-{gameId}-{playerId}"` |
| Refund feiler | CRITICAL-logget, men kaster ikke (graceful degradation) |
| Test-spill | `isTestGame=true` → alle wallet-operasjoner hoppes over |

---

## 4. Innsatsvisning (StakeCalculator)

### Server-autoritativ modell

Backend beregner `playerStakes` i `buildRoomUpdatePayload()`:

```typescript
// backend/src/util/roomHelpers.ts
for (const player of snapshot.players) {
  if (isGameRunning && gameTickets[player.id]?.length > 0) {
    // Aktiv deltaker → stake fra spillets tickets × entryFee × multiplier
    playerStakes[player.id] = roundCurrency(
      tickets.reduce((sum, t) => {
        const tt = ticketTypes.find(x => x.type === t.type);
        return sum + fee * (tt?.priceMultiplier ?? 1);
      }, 0)
    );
  } else if (armedPlayerIds.includes(player.id)) {
    // Armet mellom runder → stake fra preRoundTickets
    playerStakes[player.id] = roundCurrency(...);
  }
  // Uarmet = utelatt = 0 kr
}
```

### Regler (4 tilstander)

| # | Spillstatus | Spillerstatus | Kilde | Resultat |
|---|-------------|---------------|-------|----------|
| 1 | RUNNING | Har tickets | `gameTickets` | Faktisk innsats |
| 2 | RUNNING | Ingen tickets | — | 0 (spectator) |
| 3 | NONE/WAITING | Armet | `preRoundTickets` | Projisert innsats |
| 4 | NONE/WAITING | Ikke armet | — | 0 (vis "—") |

### Frontend-flyt

```typescript
// GameBridge.ts — handleRoomUpdate:
this.state.myStake = payload.playerStakes?.[this.myPlayerId] ?? 0;

// StakeCalculator.ts — calculateStake:
if (input.myStake !== undefined && input.myStake !== null) {
  return input.myStake;  // Server-autoritativ
}
// Fallback: klient-beregning (kun under utrulling)

// PlayScreen.ts — updateInfo:
const totalStake = stakeFromState(state);  // Returnerer state.myStake
```

### Hvorfor ikke klient-beregning?

Backend genererer `preRoundTickets` for **alle** spillere (også uarmede).
Disse "display-tickets" er kun for å vise brettene på skjermen.
Klienten kan ikke skille mellom "display-tickets" og "kjøpte tickets"
uten `isArmed`-flagget. Ved å la serveren beregne, elimineres hele
denne feilklassen.

### Test-dekning

25 tester i `StakeCalculator.test.ts`:
- 5 server-autoritative tester (myStake prioriteres)
- 14 fallback-tester (alle 4 regler × varianter)
- 6 grensescenarioer (0 kr, desimaler, ukjent type)

---

## 5. Trekking og markering (draw)

### Flyt

```
DrawScheduler trigger (autoDrawInterval)
    → BingoEngine.drawNumber(roomCode)
    → Trekker tilfeldig tall fra drawBag
    → Auto-markerer alle spilleres bonger
    → Sender drawNew { number, drawIndex, gameId }
    → Sjekker om mønster er fullført → patternWon event
```

### Frontend-håndtering

```
drawNew event
    → GameBridge: drawnNumbers.push(number), emit "numberDrawn"
    → PlayScreen.onNumberDrawn():
        1. BallTube.addBall(number)        — animert kule i glass-tube
        2. InlineScroller.markNumberOnAll() — markerer tall på alle bonger
        3. InlineScroller.sortBestFirst()   — sorterer "nesten ferdig" først
        4. CalledNumbers.addNumber()        — oppdaterer trekkhistorikk
        5. Audio.playNumber()              — nummerannonsering
        6. updateClaimButtons()            — sjekker LINE/BINGO
```

---

## 6. Claim og gevinstutbetaling (claim:submit)

### LINE claim

```
Auto-claim når Pattern_Remaining_Cell_Count == 0
    → Socket: claim:submit { roomCode, type: "LINE" }
    → Backend validering:
        1. Spill er RUNNING
        2. Spiller er i participatingPlayerIds (KRITISK-8)
        3. Spiller har tickets
        4. Idempotency-sjekk (allerede claima?)
    → Mønstervalidering:
        findFirstCompleteLinePatternIndex(ticket, marks, drawnNumbers)
    → Gevinstberegning:
        requestedPayout = floor(prizePool × 0.3)     // 30% av potten
        cappedPayout = prizePolicy.applySinglePrizeCap(requestedPayout)
        payout = min(cappedPayout, remainingPrizePool, remainingPayoutBudget)
    → Utbetaling:
        wallet.transfer(house → player, payout, {
            idempotencyKey: "line-prize-{gameId}-{claimId}"
        })
        game.remainingPrizePool -= payout
        game.remainingPayoutBudget -= payout
    → Compliance-registrering (PAYOUT + PRIZE)
    → patternWon event broadcast
```

### BINGO claim

```
Auto-claim når alle celler er markert
    → Socket: claim:submit { roomCode, type: "BINGO" }
    → Samme validering som LINE
    → Race condition guard (KRITISK-4):
        if (game.bingoWinnerId) → avvis med BINGO_ALREADY_CLAIMED
    → Gevinstberegning:
        requestedPayout = game.remainingPrizePool    // Hele restpotten
        cappedPayout = prizePolicy.applySinglePrizeCap(requestedPayout)
        payout = min(cappedPayout, remainingPrizePool, remainingPayoutBudget)
    → Utbetaling (samme mønster som LINE)
    → Spill avsluttes:
        game.status = "ENDED"
        game.endedReason = "BINGO_CLAIMED"
    → patternWon event + room:update broadcast
```

### Claim-record struktur

```typescript
{
  id: string,                    // UUID
  playerId: string,
  type: "LINE" | "BINGO",
  valid: boolean,
  reason?: string,               // "BINGO_ALREADY_CLAIMED" etc.
  payoutAmount?: number,
  payoutPolicyVersion?: string,   // Policy-ID brukt for gevinsttak
  payoutWasCapped?: boolean,      // true hvis singlePrizeCap traff
  rtpBudgetBefore?: number,       // RTP-budsjett FØR utbetaling
  rtpBudgetAfter?: number,        // RTP-budsjett ETTER utbetaling
  rtpCapped?: boolean,            // true hvis RTP-budsjett begrenset utbetaling
  payoutTransactionIds?: string[] // Wallet transaction IDs
}
```

---

## 7. Gevinsttak og policy (PrizePolicyManager)

### Scope-oppløsning (cascading)

```
1. {gameType}::{hallId}::{linkId}  — mest spesifikk
2. {gameType}::{hallId}::*         — hall-nivå
3. {gameType}::*::{linkId}         — link-nivå
4. {gameType}::*::*                — global default
```

### Default-verdier

| Parameter | Verdi |
|-----------|-------|
| `singlePrizeCap` | 2 500 kr |
| `dailyExtraPrizeCap` | 12 000 kr |

### Anvendelse

```typescript
const result = prizePolicy.applySinglePrizeCap({
  hallId: "hall-1",
  gameType: "DATABINGO",
  amount: 5000
});
// result.cappedAmount = 2500 (capped)
// result.wasCapped = true
// result.policy = { id: "...", singlePrizeCap: 2500 }
```

Capping-info lagres på claim-objektet for full sporbarhet.

---

## 8. Compliance og regulatorisk registrering

### Dual registrering

Hver finansiell hendelse registreres **to steder**:

| System | Formål | Hendelsestyper |
|--------|--------|---------------|
| **ComplianceManager** (loss ledger) | Tapsgrenser, Spillvett | BUYIN, PAYOUT |
| **ComplianceLedger** (audit trail) | Regulatorisk rapportering | STAKE, PRIZE |

### Registreringspunkter

```
game:start (per spiller):
    ├── ComplianceManager.recordLossEntry(BUYIN, entryFee)
    └── ComplianceLedger.recordEvent(STAKE, entryFee, {
            roomCode, gameId, playerId, walletId,
            sourceAccountId, targetAccountId,
            metadata: { reason: "BINGO_BUYIN" }
        })

claim:submit (ved gyldig claim):
    ├── ComplianceManager.recordLossEntry(PAYOUT, payoutAmount)
    └── ComplianceLedger.recordEvent(PRIZE, payoutAmount, {
            roomCode, gameId, claimId, playerId, walletId,
            sourceAccountId, targetAccountId,
            policyVersion: policy.id
        })
```

### Daglig rapport

```typescript
ComplianceLedger.generateDailyReport({
  date: "2026-04-15",
  hallId: "hall-1",
  gameType: "DATABINGO"
})
→ { grossTurnover, prizesPaid, net, stakeCount, prizeCount }
```

---

## 9. Sikkerhetstiltak

| Tiltak | Implementasjon | Referanse |
|--------|---------------|-----------|
| **Dobbel debitering** | Idempotency-nøkler per transfer | `buyin-{gameId}-{playerId}` |
| **Dobbel utbetaling** | Claim-idempotency + winnerId-guard | `line-prize-{gameId}-{claimId}` |
| **Race condition (BINGO)** | Double-check `bingoWinnerId` før utbetaling | KRITISK-4 |
| **Kun deltakere kan claime** | `participatingPlayerIds` sjekk | KRITISK-8 |
| **Refund ved feil** | `refundDebitedPlayers()` med idempotente refunds + reconciliation-logging | HOEY-4 |
| **Checkpoint** | Kritisk state skrives etter utbetaling | HOEY-6, HOEY-7 |
| **Tapsgrenser** | `wouldExceedLossLimit()` sjekk før buy-in | Spillvett |
| **Selvekskludering** | Blokkert ved `filterEligiblePlayers()` | Spillvett |
| **Gevinsttak** | `PrizePolicyManager.applySinglePrizeCap()` | Per hall/gameType |
| **Server-autoritativ stake** | `playerStakes` beregnet i backend | Ingen klient-beregning |
| **Single-process krav** | In-memory `lineWinnerId`/`bingoWinnerId` guard er trygg kun i single-process Node.js. Ved horisontal skalering kreves distributed locking. | Arkitekturbegrensning |
| **Penny-rounding** | `roundCurrency()` bruker exponent-shift for korrekt halvøre-runding | BIN-163 |

---

## 10. Filreferanser

### Backend

| Fil | Ansvar |
|-----|--------|
| `backend/src/game/BingoEngine.ts` | Spillmotor: start, draw, claim, payout |
| `backend/src/game/PrizePolicyManager.ts` | Gevinsttak og policy |
| `backend/src/game/ComplianceLedger.ts` | Regulatorisk audit trail |
| `backend/src/util/roomHelpers.ts` | `buildRoomUpdatePayload()`, `playerStakes` |
| `backend/src/util/roomState.ts` | `armPlayer()`, `disarmPlayer()`, armed state |
| `backend/src/util/currency.ts` | `roundCurrency()` — 2 desimalers avrunding |
| `backend/src/sockets/gameEvents.ts` | Socket event handlers (bet:arm, claim:submit) |

### Frontend (Unity C#)

Klienten er implementert i Unity (C#). Frontend-koden viser kun beløp
som serveren har beregnet og sendt via `playerStakes` i `room:update`.
Ingen monetære beregninger skjer på klientsiden.

### Shared types

| Fil | Ansvar |
|-----|--------|
| `shared-types/src/socket-events.ts` | `RoomUpdatePayload` med `playerStakes` |
| `shared-types/src/game.ts` | `Ticket`, `GameSnapshot`, `RoomSnapshot` |
