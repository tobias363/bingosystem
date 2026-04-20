# SESSION_LOG 2026-04-20 — Game 1: 5-fase norsk bingo + UX-oppvask

**Utvikler:** Claude (parret med Tobias Haugen)
**Varighet:** ~6 timer
**Omfang:** 10 PR-er merget til main (#253, #254, #255, #256, #258, #259, #260, #266, #267 — alle deployed til staging)

## Rask oversikt — "hva er Game 1 nå"

Game 1 (Spillorama classic bingo) er nå en **norsk 75-ball bingo med 5 sekvensielle faser** per runde, auto-claim-on-draw, server-autoritativ vinner-evaluering, og UX-popup-annonseringer for hver fase-win + multi-winner-split.

Før denne sesjonen avsluttet runden ved første pattern-win (én rad). Nå kjører hver runde gjennom **1 Rad → 2 Rader → 3 Rader → 4 Rader → Fullt Hus** — kun Fullt Hus avslutter runden.

**Staging:** https://spillorama-system.onrender.com/web/
**Canonical spec for reglene:** `packages/game-client/src/games/game1/README.md` (9 seksjoner, oppdatert i BIN-694)

---

## Leverte PR-er (kronologisk, merget til main)

| PR  | BIN    | Tittel                                                           | Lag                         |
|-----|--------|------------------------------------------------------------------|-----------------------------|
| #253 | BIN-686 follow-up | Innsats oppdaterer etter pre-round-kjøp                   | klient (StakeCalculator)   |
| #254 | BIN-687 | Brett drifter ikke sidelengs ved gjentatt flip                  | klient (TicketCard)         |
| #255 | BIN-688 | Pre-round brett farger matcher armet valg                       | shared-types + backend + klient |
| #256 | BIN-689 | `draw:new` drawIndex må være 0-basert på wire                   | backend (BingoEngine)       |
| #258 | BIN-690 | Pre-round brett = runde brett (grid + farge bevares)            | backend (startGame adopsjon) |
| #259 | BIN-693 | startGame name-based color lookup (defense-in-depth)            | backend (BingoEngine)       |
| #260 | BIN-692 | × avbestill-knapp på brett (Unity-paritet)                      | shared-types + backend + klient |
| #266 | BIN-694 | Norsk 75-ball bingo, 5 sekvensielle faser                       | backend + klient + docs     |
| #267 | BIN-696 | 3s fase-popup + multi-winner split-forklaring                   | shared-types + backend + klient |

Tidligere merget samme dag (pre-session):
- PR #252 (BIN-686) — 4 staging UX-bugs (base for dagens arbeid)

---

## Tematisk oppdeling

### Tema 1: Pre-round → live-round konsistens (BIN-688 / BIN-690 / BIN-693)

**Problem i serien:** Bongene du så før rundestart matchet ikke brettene du spilte med. Tre bug-lag bak én symptom-sky:

1. **BIN-688** (PR #255): Klient mistet `name` ("Small Yellow") i wire-payload. Backend ignorerte farger i `getOrCreateDisplayTickets`. Cache returnerte stale brett ved re-armering.
2. **BIN-690** (PR #258): Selv med riktige farger pre-round, genererte `engine.startGame` helt nye grid ved rundestart — `getOrCreateDisplayTickets` (display-cache) vs `bingoAdapter.createTicket` (live). To separate RNG-paths.
3. **BIN-693** (PR #259): I fallback-path (hvis adopsjon feilet) matchet backend bare på `sel.type` — alle `type: "small"` landet på første config-entry (Small Yellow). Defense-in-depth: match på `sel.name` først.

**Fiks:** `TicketSelection.name?` propageres ende-til-ende (klient → wire → backend). `startGame` adopterer display-cachen som ekte bonger. Fallback bruker `name` først.

**Tester:** 23 nye regresjonstester.

### Tema 2: Ball-historikk + animasjon (BIN-689)

**Problem:** Ingen baller vises i ball-tuben under RUNNING. Console spammes med `[GameBridge] drawNew gap detected — requesting room:state resync` på hver draw.

**Rot:** Backend `BingoEngine.drawNextNumber()` returnerte `drawIndex = drawnNumbers.length` etter push (1-basert). Klient `GameBridge.handleDrawNew` er 0-basert (`lastAppliedDrawIndex = -1`, expected 0 for første ball). Konstant gap-of-1 → evig resync-loop → `numberDrawn`-event emittes aldri → `BallTube.addBall` kalles aldri.

**Fiks:** Kun returverdien fra `drawNextNumber` endret til `length - 1`. Engine-interne hooks (G2 jackpot, G3 patterns) beholder 1-basert `drawnCount`-semantikk.

### Tema 3: Innsats + brett-flip-drift (BIN-686 follow-up + BIN-687)

- **BIN-686 follow-up** (PR #253): Backend sender `playerStakes = 0` under WAITING (ikke debitert enda). `StakeCalculator` behandlet 0 som autoritativt → "Innsats: 0 kr" selv etter kjøp. Fiks: server-stake autoritativ bare under RUNNING eller ved > 0.
- **BIN-687** (PR #254): `flipToDetails()` satte `pivot.x = cardW/2` + `this.x += cardW/2`. `flipToGrid()` tweenet scale tilbake men nullstilte aldri pivot → brett drifter `cardW/2` per flip. Fiks: reset pivot + x-offset i `flipToGrid`-s inner onComplete.

### Tema 4: × avbestill-knapp på brett (BIN-692)

**Feature** (PR #260): X øverst til venstre på hvert pre-round-brett for å avbestille. Bundle-typer (Large = 3 brett, Elvis = 2, Traffic-light = 3) fjernes som helhet — klikk på hvilket som helst brett i bundelen.

**Arkitektur:**
- Ny event `ticket:cancel` med Zod-validert payload
- `RoomStateManager.cancelPreRoundTicket()` håndterer bundle-resolusjon + atomisk disarm
- Klient: `TicketCard`/`TicketGroup` har opt-in `cancelable?` + `onCancel?` — kun satt i `renderPreRoundTickets` (ikke under RUNNING)
- Gated server-side mot RUNNING
- Pre-round er ikke wallet-debitert → ingen refund-operasjon nødvendig

**Tester:** 15 nye.

### Tema 5: Norsk 5-fase bingo (BIN-694 — hovedfunksjonen i dag)

**Problem:** Dagens kode avsluttet runden ved første pattern-win (én rad). Norsk 75-ball bingo krever 5 sekvensielle faser i samme runde — trekning fortsetter til Fullt Hus.

**Fase-modell** (avklart av Tobias 2026-04-20):

| # | Navn        | Krav                                                    | Premie (default) |
|---|-------------|---------------------------------------------------------|------------------|
| 1 | "1 Rad"     | ≥1 hel horisontal rad **ELLER** ≥1 hel vertikal kolonne | 15 %             |
| 2 | "2 Rader"   | ≥2 hele **vertikale** kolonner                          | 15 %             |
| 3 | "3 Rader"   | ≥3 hele **vertikale** kolonner                          | 15 %             |
| 4 | "4 Rader"   | ≥4 hele **vertikale** kolonner                          | 15 %             |
| 5 | "Fullt Hus" | Alle 25 felt merket                                     | 40 %             |

**NB:** "Rad N" i fase 2-5 betyr **N vertikale kolonner**, ikke horisontale rader. Kun fase 1 godtar horisontal rad. **Ingen diagonaler** teller i noen fase.

**Implementasjon:**
- Ny `DEFAULT_NORSK_BINGO_CONFIG` (opt-in via gameSlug "bingo"/"game_1"/"norsk-bingo"). Gamle `DEFAULT_STANDARD_CONFIG` bevart for bakoverkompat.
- Ny `autoClaimPhaseMode`-flag i variantConfig (kun norsk bingo setter den) — unngår å bryte G2/G3 som har egne `onDrawCompleted`-overrider.
- Nye `countCompleteRows()` + `countCompleteColumns()` i `ticket.ts` (ingen diagonaler).
- Ny `BingoEngine.evaluateActivePhase()` kjører etter hver ball — identifiserer vinnere via `meetsPhaseRequirement()`, splitter premie, betaler ut, emitter `pattern:won`, fortsetter til neste fase.
- Ny `BingoEngine.payoutPhaseWinner()` — full ledger/audit/wallet-chain gjenbrukt fra submitClaim.
- Server-autoritativ eval bruker `game.drawnNumbers` (ikke `game.marks`) — spillere som ikke aktivt merker får fortsatt premie.
- Multi-winner split **per spiller** (en spiller med 3 vinnende brett = ÉN vinner i splittingen).
- Rekursivt re-kall av `evaluateActivePhase` for edge-case der én ball vinner to faser samtidig.

**Tester:** 20 nye. Inkluderer E2E full sekvens (ball-for-ball-bekreftelse av alle 5 faser).

### Tema 6: UX-popup for fase-win (BIN-696)

**Feature** (PR #267): Klar annonsering av hver fase-win per Tobias' UX-ønske.

**Alle spillere** (3s info-toast, lite popup øverst):
- "1 Rad er vunnet!" / "2 Rader er vunnet!" / ...
- **"Fullt Hus er vunnet. Spillet er over."** (spesiell tekst for siste fase)

**Kun vinner(ene)** (5s win-toast, 2 linjer):
- Solo: `"Du vant 1 Rad!\nGevinst: 15 kr"`
- Multi-winner: `"Du vant 1 Rad!\nDin gevinst: 15 kr (premien delt på 3 spillere som vant samtidig)"`

**Wire-utvidelse:** `pattern:won` har fått valgfrie `winnerIds: string[]` + `winnerCount: number`. Backward compat — eldre klient faller tilbake til `winnerId`-singleton.

**Teknisk:** `ToastNotification` endret fra `white-space: nowrap` til `pre-line` for å bevare `\n` som synlig linjeskift.

**Tester:** 8 nye på `onPatternWon`-logikken.

---

## Nøkkel-filer (cheat sheet for ny utvikler)

### Backend (`apps/backend/src/`)

| Fil | Hva |
|-----|-----|
| `game/BingoEngine.ts` | **Kjernen**. `drawNextNumber`, `submitClaim`, `evaluateActivePhase` (BIN-694), `payoutPhaseWinner` (BIN-694), `meetsPhaseRequirement` (BIN-694). |
| `game/ticket.ts` | `generateTicketForGame`, `countCompleteRows`/`Columns` (BIN-694), `hasFullBingo`, `findFirstCompleteLinePatternIndex` |
| `game/variantConfig.ts` | `DEFAULT_STANDARD_CONFIG` (legacy) + `DEFAULT_NORSK_BINGO_CONFIG` (nytt). Slug-mapping `"bingo"/"game_1"/"norsk-bingo"` → norsk. |
| `game/types.ts` | `PatternResult.winnerIds?` (BIN-696) |
| `util/roomState.ts` | `getOrCreateDisplayTickets` (m/ `colorAssignments` fra BIN-688), `cancelPreRoundTicket` (BIN-692) |
| `sockets/gameEvents.ts` | Alle socket-handlers. `ticket:cancel` (BIN-692). `pattern:won`-emit med winnerIds (BIN-696). |
| `util/schedulerSetup.ts` | Auto-draw scheduler, også emitter `pattern:won` (BIN-696) |

### Klient (`packages/game-client/src/games/game1/`)

| Fil | Hva |
|-----|-----|
| `Game1Controller.ts` | Phase-maskin, socket-handlers. `handleCancelTicket` (BIN-692), `onPatternWon` (BIN-696). |
| `screens/PlayScreen.ts` | `buildTickets`, `renderPreRoundTickets` (skiller pre-round cancelable=true fra RUNNING cancelable=false) |
| `components/TicketGroup.ts` + `game2/components/TicketCard.ts` | × cancel-knapp (BIN-692), flip-reset (BIN-687) |
| `components/ToastNotification.ts` | `pre-line` whitespace for `\n` linjeskift (BIN-696) |
| `logic/StakeCalculator.ts` | Innsats-beregning, RUNNING-server-autoritativ / WAITING fallback (BIN-686 follow-up) |
| `bridge/GameBridge.ts` | drawIndex-kontrakt 0-basert (BIN-689) |
| `README.md` | Komplette norske bingo-regler i 9 seksjoner (BIN-694) |

### Shared-types (`packages/shared-types/src/`)

| Fil | Hva |
|-----|-----|
| `schemas.ts` | Zod-skjemaer. `TicketSelection.name?` (BIN-688), `TicketCancelPayloadSchema` (BIN-692), `PatternWonPayloadSchema.winnerIds?/winnerCount?` (BIN-696) |
| `socket-events.ts` | `SocketEvents.TICKET_CANCEL` (BIN-692), re-export av skjemaer |

---

## Kjent backlog (ikke fikset enda)

### BIN-695 — Fysisk bong-verifisering (hall-admin)

Hybride haller (fysiske + digitale bonger): fysisk bingovert må pause trekningen når spiller roper "Bingo!", verifisere manuelt mot liste over trukne tall.

**Nåværende status:**
- Digital auto-claim fungerer (BIN-694)
- `engine.pauseGame(roomCode, message)` finnes allerede (BIN-460)
- **Mangler:** Hall-admin-UI for å skrive inn bong-ID og verifisere. Planlagt å introdusere bong-nummer-register backend-side.

### UI-polish (ikke prioritert)

- Dedikert fase-indikator i `CenterTopPanel` ("Fase 2 av 5: 2 Rader") — eksisterende pattern-list-widget viser allerede patterns dynamisk
- Animasjon på fase-transisjon (fullt-hus fireworks o.l.)

### Rydding (utsatt av Tobias)

Audit-rapport fra 2026-04-20 identifiserte 7 tekniske gjeldspunkter. Tobias sa: "ta rydding som eget steg etter bugs er fikset". Eksempler:
- Duplisert TicketCard-opprettelse i PlayScreen + TicketOverlay → factory-funksjon
- Silent fallbacks (`ticket.grid?.length ?? 3`) som maskerer data-integritetsfeil
- `stateChanged` emittes på *hver* `room:update` (også kosmetiske endringer) — potensielt kilde til blink-issues hvis de dukker opp igjen

---

## Kjøre tester

**Alt fra repo-root:**

```bash
# Backend
cd apps/backend
LOG_LEVEL=warn ../../node_modules/.bin/tsx --test 'src/**/*.test.ts'
# → 1608+/1609 grønt (1 pre-existing skip)

# Game-client
cd ../..
node_modules/.bin/vitest run packages/game-client/
# → 273/273 grønt

# Shared-types + typecheck
node_modules/.bin/tsc --noEmit -p packages/shared-types
cd apps/backend && ../../node_modules/.bin/tsc --noEmit
```

**Kritiske testfiler for de store endringene:**

- `apps/backend/src/game/BingoEngine.fivePhase.test.ts` — 7 tester, inkl. **E2E full sekvens** som låser 1→2→3→4→Fullt-Hus-flyten
- `apps/backend/src/game/ticket.countCompleteLines.test.ts` — 13 tester for rows/cols (ingen diagonaler)
- `apps/backend/src/util/roomState.cancelPreRoundTicket.test.ts` — 11 tester for × avbestill + bundle-logikk
- `apps/backend/src/game/BingoEngine.preRoundAdoption.test.ts` — 4 tester for display-cache-adopsjon ved startGame
- `packages/game-client/src/games/game1/Game1Controller.patternWon.test.ts` — 8 tester for popup-tekster
- `apps/backend/src/sockets/__tests__/socketIntegration.test.ts` — utvidet med BIN-689 drawIndex og BIN-692 ticket:cancel E2E

---

## Staging-testsjekkliste

https://spillorama-system.onrender.com/web/

**Grunnflyt:**
- [ ] Join Game 1, arm 3 brett (f.eks. 1× Small Yellow + 1× Small White + 1× Small Purple)
- [ ] Start runde → brettene beholder riktige farger + tall er de samme som pre-round
- [ ] Ballene vises i tuben med animasjon, console viser ingen `gap detected`-warnings
- [ ] Når du vinner fase 1 → popup "1 Rad er vunnet!" + personlig win-toast
- [ ] Runden fortsetter → fase 2, 3, 4 annonseres
- [ ] Fullt Hus → "Spillet er over"-popup + EndScreen

**Multi-winner:**
- [ ] 2+ spillere med identiske brett → begge vinner samtidig → popup viser "delt på 2"

**Pre-round-cancel:**
- [ ] × på Small-brett → ett brett forsvinner
- [ ] × på Large-bundle (3 brett) → alle 3 forsvinner samtidig
- [ ] Under RUNNING → × er ikke synlig

**Flip-drift:**
- [ ] Trykk samme brett 5× raskt → står stille, ingen sidelengs drift

---

## Arbeidsflyt-prinsipper brukt i dag

1. **Stop-and-wait før kode** — hver stor endring begynte med diagnose-rapport til Tobias + godkjenning
2. **Én PR per logisk endring** — ikke blande fix + refactor + feature
3. **Test-first for kritiske kontrakter** — E2E-test for 5-fase før commit, regressionstester for off-by-one-bugs
4. **Verifisere at testen faktisk fanger bugen** — stash fix + kjør test (skal feile) → restore fix → kjør test (skal passere)
5. **Bakoverkompatibilitet over skyggefri refaktor** — DEFAULT_STANDARD_CONFIG bevart for eldre tester, NORSK_BINGO_CONFIG opt-in via slug
6. **Lettvekts-harness-tester for controller-logikk** — mirror av produksjonskode uten hele app-bootstrap
7. **Defense-in-depth** — BIN-693 som fallback-sikring selv når BIN-690 fungerer

---

## Kilder i koden for regelverket

- **Komplette spillregler**: `packages/game-client/src/games/game1/README.md` (9 seksjoner)
- **Fase-krav**: `BingoEngine.meetsPhaseRequirement()` (autoritativ — returnerer true/false per brett)
- **Linje-telling**: `ticket.countCompleteRows()` + `countCompleteColumns()` (ingen diagonaler)
- **Premie-fordeling**: `DEFAULT_NORSK_BINGO_CONFIG.patterns[i].prizePercent` (overstyrbar per hall via DB)

---

## Kontaktpunkter for videre arbeid

- **Produkt-eier (UX / regler):** Tobias Haugen
- **Deploys:** Render.com auto-deploy fra `main` (3-5 min pr push)
- **CI:** GitHub Actions (`backend` + `compliance` jobs)
- **Sentry:** Backend-errors logges. Searche etter BIN-nr i breadcrumbs for kontekst.

**Neste anbefalt steg:**
1. BIN-695 (fysisk bong-verifisering) — påbegynnes når hall-prosjekt trenger det
2. Rydding-backlog (audit-rapport 2026-04-20)
3. Klient-UI-polish for fase-progresjon hvis brukere ønsker mer synlig fase-indikator
