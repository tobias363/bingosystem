---
game: game3
name: Monster Bingo / Mønsterbingo
marketName: "Spill 3 / Mønsterbingo"
slug: monsterbingo
regulatoryCategory: Hovedspill
ticketGrid: 5x5
centerCell: none  # Ingen fri sentercelle (alle 25 cellene er reelle tall)
ballRange: [1, 75]
maxDrawsPerRound: 75
ticketTypes:
  - code: standard
    weight: 1
maxTicketsPerPlayer: 30
autoArm: false
patterns:
  - id: t-shape
    name: "T"
    claimType: BINGO
    prizePercent: 25
    order: 1
    notes: "Topp-rad (5 celler) + midtkolonne ned (4 celler) — 9 celler totalt"
  - id: x-cross
    name: "X (Kryss)"
    claimType: BINGO
    prizePercent: 25
    order: 2
    notes: "Begge diagonaler — 9 celler"
  - id: seven-shape
    name: "7"
    claimType: BINGO
    prizePercent: 25
    order: 3
    notes: "Topp-rad + diagonal nedover — 9 celler"
  - id: pyramid
    name: "Pyramide"
    claimType: BINGO
    prizePercent: 25
    order: 4
    notes: "Bunn-rad + diagonal opp — 9 celler"
miniGames: []  # Ingen mini-games — Spill 3 er rent mønsterspill
audioVoicePacks: []  # Ikke portet
features:
  chat: true  # G3 har chat (delt fra G1)
  doubleAnnounce: false
  luckyNumber: false  # Spill 3 har IKKE Lucky Number — kun Spill 2
  ticketReplace: false
  hallDisplayBroadcast: false
  animatedBallQueue: true  # G3-signatur: vertikal FIFO-kø
  waypointBallPath: false  # Unity BallPathRottate.cs ikke portet
  patternAnimation: false  # Ping-pong skala ikke portet
  perpetualLoop: true  # Aldri stopper — utbetal → ny runde automatisk
  globalRoom: true  # ETT globalt rom (`MONSTERBINGO`) — alle haller deler dette
complianceModel: hall-based
spillvettLimits:
  dailyLoss: 900
  monthlyLoss: 4400
  sessionMs: 3600000
  pauseMs: 300000
  selfExclusionMs: 31536000000
parityStatus: MVP
revisionDate: 2026-05-04
---

# Game 3 Canonical Spec — Monster Bingo / Mønsterbingo

**Formål:** Frosset spesifikasjon av Game 3 per **2026-05-04** (Tobias-direktiv:
4 design-mønstre à 25 % i stedet for Row 1-4 + Coverall, etter PR #895).
Erstatter forrige Row 1-4-spec som var foreldet etter PR #895.

> **Viktig:** Spill 3 er **funksjonelt og visuelt likt Spill 1** — samme
> 5×5-bonger uten free-center, samme 75 baller, samme draw-mekanikk. De
> **strukturelle forskjellene** er:
> 1. Spill 3 har KUN ÉN ticket-type ("Standard"), mens Spill 1 har 8 farger.
> 2. Spill 3 har 4 design-mønstre (T/Kryss/7/Pyramide à 25 %), mens Spill 1
>    har Row 1-4 + Coverall.
> 3. Spill 3 har ETT globalt rom (`MONSTERBINGO`), mens Spill 1 har per
>    group-of-halls.
> 4. Spill 3 kjører perpetual loop, mens Spill 1 har master/start/stop.
> 5. Spill 3 har **ingen** Lucky Number — kun Spill 2.
>
> Per Tobias 2026-05-03 (revert-direktiv):
> > "75 baller og 5x5 bonger uten free i midten. Du kan duplisere spill 1 så
> > kan vi endre når det er gjort. Alt av design skal være likt bare at her er
> > det kun 1 type bonger og man spiller om mønstre. Logikken med å trekke
> > baller og markere bonger er fortsatt helt lik."
>
> Per Tobias 2026-05-04 (PR #895): Row 1-4 + Coverall byttet til 4 design-
> mønstre fra patterns.jsx-spec, alle 25 %.

---

## 1. Identifikasjon

| Felt | Verdi |
|------|-------|
| Markedsføringsnavn | Spill 3 / Mønsterbingo |
| Backend-slug | `monsterbingo` (også `mønsterbingo`, `game_3`) |
| Frontend-pakke | `packages/game-client/src/games/game3/` |
| Backend-logikk | `apps/backend/src/game/Game3Engine.ts` (subklasse av BingoEngine) |
| Game type | Multiplayer, sanntid, ETT globalt rom (`MONSTERBINGO`) |
| Regulatorisk kategori | Hovedspill (15 % til organisasjoner) |
| Legacy-referanse | `legacy/unity-backend/Game/Game3/Sockets/game3.js` |

---

## 2. Spillflyt

```
Lobby (LOBBY/WAITING — BuyPopup synlig som "Neste spill")
  → Billett-kjøp (eksplisitt via BuyPopup — kun "Standard"-type)
  → Arming via bet:arm
  → RUNNING (auto-draw, BuyPopup forblir synlig som "Forhåndskjøp – neste runde")
  → Per draw: kule dropper inn i AnimatedBallQueue
  → Auto-claim-on-draw evaluerer alle 4 mønstre etter hver trekning
  → Vinner får 25 % av pot per pattern (4 × 25 % = 100 %)
  → Når alle 4 mønstre er vunnet, signaliserer engine `endedReason: "G3_FULL_HOUSE"`
  → ENDED — bonger fjernes umiddelbart fra UI
  → 30 sekunder pause (PERPETUAL_LOOP_DELAY_MS)
  → PerpetualRoundService scheduler ny runde automatisk
```

**Klient-state-maskin** (`Game3Controller.ts`): `LOADING` → `LOBBY` →
`PLAYING` (eller `SPECTATING`) → `ENDED`.

**Per Tobias 2026-05-03:**
> "Spill 2 og 3 har ETT globalt rom. Ingen group-of-halls, ingen master/start/
> stop. Aldri stopper — utbetal gevinst → fortsetter automatisk."

---

## 3. Konfigurerbare verdier

| Parameter | Kilde | Default | Notater |
|-----------|-------|---------|---------|
| Ball-range | `DEFAULT_GAME3_CONFIG.maxBallValue` | 1–75 | BINGO-kolonne-gruppert |
| Drawbag-size | `DEFAULT_GAME3_CONFIG.drawBagSize` | 75 | Hele bagget tilgjengelig |
| Grid | Backend ticket-generator (`generate5x5NoCenterTicket`) | 5×5 (25 celler) | Ingen fri sentercelle |
| Pris per brett | Hall-konfig | 10 kr | Standard-default |
| Pattern-prosenter | `DEFAULT_GAME3_CONFIG.patterns[i].prizePercent` | 25 % per pattern (4 × 25 = 100) | Likt for alle 4 |
| Pause mellom runder | `PERPETUAL_LOOP_DELAY_MS` | 30 000 ms (30 s) | Env-overstyrbar |
| Pause mellom baller | `AUTO_DRAW_INTERVAL_MS` | 2 000 ms (2 s) | Env-overstyrbar |
| Total runde-syklus | Beregnet | ~180 s | 75 × 2 s + 30 s pause |
| Lucky-bonus | N/A | 0 | **Ingen Lucky Number i Spill 3** |

---

## 4. Ticket types

**Kun `Standard` (én type).** Ingen per-type varianter (i motsetning til Spill 1
som har 8 farger).

```typescript
ticketTypes: [
  { name: "Standard", type: "monsterbingo-5x5", priceMultiplier: 1, ticketCount: 1 },
]
```

Ticket-format: 5×5 grid, 25 unike tall fordelt per BINGO-kolonne (B:1-15,
I:16-30, N:31-45, G:46-60, O:61-75). **Ingen fri sentercelle** —
(2,2)-cellen holder et reelt N-kolonne-tall.

---

## 5. Win-patterns

4 design-mønstre, alle 25 % av pot. Sum = 100 %.

| Pattern | claimType | prizePercent | Celler (row-major, 0-24) |
|---------|-----------|--------------|--------------------------|
| T (Topp + midt) | BINGO | 25 % | [0,1,2,3,4, 7, 12, 17, 22] |
| X (Kryss) | BINGO | 25 % | [0,4, 6,8, 12, 16,18, 20,24] |
| 7 (Topp + diagonal) | BINGO | 25 % | [0,1,2,3,4, 8, 12, 16, 20] |
| Pyramide | BINGO | 25 % | [12, 16,17,18, 20,21,22,23,24] |

Hvert mønster består av 9 celler. Fire mønstre × 25 % gir 100 % utbetaling
per runde når alle vinnes.

**Implementasjon:** `DEFAULT_GAME3_CONFIG` bruker `design: 0` med eksplisitt
`patternDataList` (25-bit bitmask, row-major). `cellsToBitmask()`-helper
konverterer celle-indekser til bitmask uten å håndskrive 25-element-arrays.

`patternEvalMode: "auto-claim-on-draw"` — engine evaluerer alle aktive
patterns etter hver draw og auto-utløser claim for vinnere uten at spilleren
trenger å trykke "Bingo!".

**Forskjell fra Spill 1:** Spill 1 har Row 1-4 (4 × 10 % = 40 %) + Coverall
(60 %). Spill 3 har 4 design-mønstre (4 × 25 % = 100 %). Spill 3 har **ingen**
Coverall-pattern — siste vinst kommer når én spiller (eller fire) har klart
alle 4 design-mønstre.

---

## 6. Mini-games

**Game 3 har ingen mini-games.** `miniGames: []` i front-matter. Forskjell fra
Spill 1 som har Wheel of Fortune / Treasure Chest / Mystery / ColorDraft.

---

## 7. Animert kulekø (Spill 1-stil)

Beholdt fra forrige spec — er G3's signatur og passer modellen:

- Vertikal FIFO-kø, venstre side av skjermen
- Maks 5 synlige kuler
- Nye kuler dropper inn fra toppen med `power2.in` (akselerasjon)
- Skala 1.2× → 1.0× ved ankomst (matcher Unity `highlightScale`)
- Full kø: eldste fader ut, resten skyves ned, ny dropper inn
- Fargekodet etter BINGO-kolonne (B/I/N/G/O)

---

## 8. Kjøp-flyt (BuyPopup)

| Fase | BuyPopup-status | Tittel |
|------|-----------------|--------|
| LOBBY | Synlig | "Neste spill" |
| WAITING | Synlig | "Neste spill" |
| RUNNING | Synlig | "Forhåndskjøp – neste runde" |
| ENDED → ny runde | Bonger fjernes umiddelbart | — |

Eksplisitt kjøp via BuyPopup. Ingen auto-arm. `preRoundTickets` (state)
populerer pre-bought brett som vises som preview før neste runde starter,
deretter erstattes av `myTickets` ved arm.

---

## 9. Rom-modell

**ETT globalt rom** med fast roomCode `MONSTERBINGO` (referanse:
`apps/backend/src/util/canonicalRoomCode.ts`). Alle haller deler dette
rommet — det finnes aldri flere `monsterbingo`-rom samtidig.

`RoomUniquenessInvariantService` håndhever invarianten:
- Spill 3: ETT globalt rom per slug — duplikater detekteres + konsolideres
  ved boot og periodisk tick
- Strukturert log: `event=DUPLICATE_GLOBAL_ROOM`

Konsekvenser:
- Ingen master/start/stop-flow
- Ingen group-of-halls-koordinering
- Spilleplan irrelevant — alltid på (perpetual loop)
- Compliance-binding: kjøp bindes til kjøpe-hall via `actor_hall_id`

---

## 10. Socket-kontrakt

Identisk wire-shape som Spill 1/2/5:

| Event | Innhold |
|-------|---------|
| `room:state` | `currentGame.tickets` er 5×5 grids uten free-center |
| `draw:new` | Per-ball trekking (BINGO-kolonne kodet) |
| `pattern:won` | `patternName` (T/Kryss/7/Pyramide), `pricePerWinner` |
| `chat:*` | Delt fra G1 |

---

## 11. Checkpoint og recovery

Samme som G1/G2/G5. Shared infrastruktur fra BIN-502.

---

## 12. Audio og animasjoner

**Lyd ikke portet.** `audioVoicePacks: []`.

**Animasjoner:**

| Animasjon | Parametre | Utløser |
|-----------|-----------|---------|
| Ball drop (kulekø) | `power2.in`, ~0.4 s | Per `draw:new` |
| Ball highlight | scale 1.2× → 1.0×, 0.2 s | Ved ankomst i kulekø |
| Ball fade-out | opacity 1 → 0, 0.3 s | Eldste i full kø |
| Ticket mark | scale pulse | Standard fra G1 |
| Bong-fjerning ved ENDED | Fade-ut | Umiddelbart når runde slutter |

---

## 13. Kjente avvik fra Spill 1

### 13.1 Bevisste valg (Tobias-direktiv 2026-05-03 + 2026-05-04)

| Feature | Spill 1 | Spill 3 |
|---------|---------|---------|
| Ticket-typer | 8 farger (Small/Large × Yellow/White/Purple etc.) | **1 type** ("Standard") |
| Mini-games | Wheel/Chest/Mystery/ColorDraft (rotasjon) | **Ingen** |
| Master/start/stop | Ja (master-rolle, group-of-halls) | **Nei** (ETT globalt rom) |
| Schedule-håndtering | Ja (per hall-vindu) | **Nei** (alltid på, perpetual loop) |
| Free centre cell | Ja (sentercelle = 0) | **Nei** (alle 25 celler er tall) |
| Ball-range | 1–75 | 1–75 (likt) |
| Win-patterns | Row 1-4 (40 %) + Coverall (60 %) | **T / Kryss / 7 / Pyramide à 25 %** |
| Lucky Number | Ja (bonus ved Fullt Hus på lucky-ball) | **Nei** — ingen Lucky Number i Spill 3 |
| Auto-claim på draw | Ja (BIN-694) | Ja (likt) |
| Chat-panel | Ja | Ja (likt, delt komponent) |
| Animated ball queue | Ja | Ja (G3-signatur, lik Spill 1) |
| Perpetual loop | Nei | **Ja** (PerpetualRoundService) |

### 13.2 Perpetual loop

- Implementert via `PerpetualRoundService`
  (`apps/backend/src/game/PerpetualRoundService.ts`) — wired på
  `bingoAdapter.onGameEnded` i `index.ts`.
- Default delay 30 sek mellom siste pattern og ny runde.
- Env-flagg: `PERPETUAL_LOOP_ENABLED` / `PERPETUAL_LOOP_DELAY_MS` /
  `PERPETUAL_LOOP_DISABLED_SLUGS`.
- Spawner første runde via `spawnFirstRoundIfNeeded()` ved første
  `room:join` (PR #868).

### 13.3 Beholdt fra Spill 1-paritet

- AnimatedBallQueue (G3-signatur, beholdt)
- Chat-panel (delt med Spill 1)
- 5×5-grid + 75-ball-mekanikk
- Auto-claim-on-draw

---

## 14. Filer

**Backend:**
- `apps/backend/src/game/Game3Engine.ts` — subklasse av BingoEngine, pattern-evaluering
- `apps/backend/src/game/variantConfig.ts` — `DEFAULT_GAME3_CONFIG`
  (5×5 / 1..75 / 4 design-mønstre / 1 ticket-type)
- `apps/backend/src/game/ticket.ts` — `generate5x5NoCenterTicket`,
  `uses5x5NoCenterTicket` (matcher Spill 3-slugs)
- `apps/backend/src/game/PerpetualRoundService.ts` — auto-restart etter siste pattern
- `apps/backend/src/game/ledgerGameTypeForSlug.ts` — Spill 3 → MAIN_GAME (15 %)
- `apps/backend/src/util/canonicalRoomCode.ts` — `MONSTERBINGO` global-room håndhevelse

**Klient (Spill 3-spesifikk):**
- `packages/game-client/src/games/game3/Game3Controller.ts` — `gameSlug: "monsterbingo"`
- `packages/game-client/src/games/game3/screens/PlayScreen.ts` — 5×5 grids + chat + kulekø
- `packages/game-client/src/games/game3/components/AnimatedBallQueue.ts` — G3-signatur
- `packages/game-client/src/games/game3/components/PatternBanner.ts` — pattern-banner

**Delt fra Spill 1:**
- `packages/game-client/src/components/ChatPanel.ts` (chat — delt med Spill 1)
- `packages/game-client/src/games/game1/components/TicketCard.ts` (gridSize="5x5")
- `packages/game-client/src/games/game1/screens/LobbyScreen.ts` (lobby-stil)

---

## 15. Redigerings-policy

PR som endrer G3-adferd MÅ oppdatere denne filen.

---

## 16. Revisjonshistorikk

| Dato | Endring |
|------|---------|
| 2026-04-17 | Initial canonical spec (BIN-530). 5×5 / 1..75 / Row 1-4 + Coverall, MVP med animert kulekø som G3-signatur. |
| 2026-05-03 | PR #860: kortvarig portet til 3×3 / 1..21 / Coverall-only (hybrid Spill 2-runtime + Spill 1-stil). |
| 2026-05-03 | **Revertert** per Tobias-direktiv tilbake til 5×5 / 1..75 / Row 1-4 + Coverall, men med kun 1 ticket-type ("Standard"). Perpetual loop fra PR #863 + #868 bevart. |
| 2026-05-04 | **PR #895** — patterns byttet fra Row 1-4 + Coverall til 4 design-mønstre (T / Kryss / 7 / Pyramide à 25 %). Spec oppdatert til å reflektere `DEFAULT_GAME3_CONFIG.patterns` med eksplisitt `patternDataList` per mønster. Bekreftet at Spill 3 ikke har Lucky Number (kun Spill 2). |
