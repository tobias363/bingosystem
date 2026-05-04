---
game: game2
name: Tallspill (Spill 2)
marketName: "Spill 2 / Tallspill"
slug: rocket  # DB-slug beholdes — kanonisk, kan ikke endres uten migrasjon
regulatoryCategory: Hovedspill
ticketGrid: 3x3
centerCell: none  # Alle 9 celler er reelle tall — ingen fri sentercelle
ballRange: [1, 21]
maxDrawsPerRound: 21
ticketTypes:
  - code: standard
    weight: 1
maxTicketsPerPlayer: 4  # Standard cap for arm; 30 mulig via ticketSelections-pattern
autoArm: false
patterns:
  - id: full-plate
    name: "Full plate"
    claimType: BINGO
    prizePercent: 100  # Premie via jackpot-skala — ikke prosent av pool
    order: 1
    notes: |
      Alle 9 celler markert. Premien følger jackpot-skala basert på antall
      baller trukket når full plate vinnes:
        9 baller  → 50 kr
        10 baller → 100 kr
        11 baller → 250 kr
        12 baller → 500 kr
        13 baller → 1 000 kr
        14–21     → 2 500 kr
miniGames: []  # Game 2 har ingen mini-games
audioVoicePacks: []  # Lydfiler ikke portet ennå
features:
  chat: true  # Portet (gjenbruker G1 ChatPanel + chat:history)
  doubleAnnounce: false
  luckyNumber: true  # Spilleren velger ett tall ved kjøp; siste trukne ball + full plate-vinner = bonus
  ticketReplace: false
  hallDisplayBroadcast: false
  blindTickets: false  # Legacy Game2BuyBlindTickets — ikke portet
  rocketStacking: false  # Fjernet 2026-05-03 — ingen rakett-tematikk
  perpetualLoop: true  # Ny runde starter automatisk etter 30s
  globalRoom: true  # ETT globalt rom (`ROCKET`) — alle haller deler dette
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

# Game 2 Canonical Spec — Tallspill (Spill 2)

**Formål:** Frosset spesifikasjon av Game 2 per **2026-05-04** (Tobias-direktiv:
3×3 / 1..21 / full plate / jackpot-skala / ETT globalt rom). Erstatter forrige
versjon (2026-04-17) som beskrev 3×5 / 1..60 / line+full-card — den var aldri
i kontakt med faktisk kode etter PR #873/#893/#896.

> **Viktig:** Spill 2 er nå **et tallspill med jackpot-skala** — ikke et
> tradisjonelt bingospill. Alle 9 celler må markeres for å vinne (full plate),
> og premien skalerer med hvor tidlig i runden det skjer. Spilleren velger
> ett "Lucky Number" ved kjøp som gir bonus hvis det også er den siste
> trekningsballen.
>
> Ved uenighet mellom denne filen, `game2/README.md`, og kode: kode vinner →
> oppdater denne filen i samme PR.

---

## 1. Identifikasjon

| Felt | Verdi |
|------|-------|
| Markedsføringsnavn | Spill 2 / Tallspill |
| Backend-slug | `rocket` (historisk arv — kan ikke endres uten migrasjon) |
| Frontend-pakke | `packages/game-client/src/games/game2/` |
| Backend-logikk | `apps/backend/src/game/BingoEngine.ts` (delt) + `Game2Engine` ved spesifikke utvidelser |
| Game type | Multiplayer, sanntid, ETT globalt rom (`ROCKET`) |
| Regulatorisk kategori | Hovedspill (15 % til organisasjoner) |
| Legacy-referanse | `legacy/unity-backend/Game/Game2/Sockets/game2.js` (delvis paritet) |

---

## 2. Spillflyt

```
Lobby (LOBBY/WAITING — BuyPopup synlig som "Neste spill")
  → Billett-kjøp (eksplisitt, max 4 standard / 30 via ticketSelections)
  → Lucky Number-valg (1..21)
  → Arming via bet:arm
  → RUNNING (auto-draw, BuyPopup forblir synlig som "Forhåndskjøp – neste runde")
  → Per draw: kule trekkes, alle ticket-celler oppdateres
  → Auto-claim-on-draw evaluerer full plate (alle 9 celler)
  → Vinner får jackpot fra skala (basert på drawCount)
  → Lucky Number-bonus hvis siste ball matcher spillerens valg
  → ENDED — bonger fjernes umiddelbart fra UI
  → 30 sekunder pause (PERPETUAL_LOOP_DELAY_MS)
  → Ny runde starter automatisk
```

**Klient-state-maskin** (`Game2Controller.ts`):
- `LOADING` → `LOBBY` → `PLAYING` → `ENDED` → tilbake til `LOBBY`

**Per Tobias 2026-05-04:**
> "Spill 2 og 3 har ETT globalt rom. Ingen group-of-halls, ingen master/start/
> stop. Aldri stopper — utbetal gevinst → fortsetter automatisk."

---

## 3. Konfigurerbare verdier

| Parameter | Kilde | Default | Notater |
|-----------|-------|---------|---------|
| Ball-range | `DEFAULT_GAME2_CONFIG.maxBallValue` | 1–21 | Faste 21 unike tall |
| `drawBagSize` | `DEFAULT_GAME2_CONFIG.drawBagSize` | 21 | Hele bagget trekkes |
| Grid | Backend ticket-generator (`game2-3x3`) | 3×3 (9 celler) | Ingen fri sentercelle |
| Pris per brett | Hall-konfig | 10 kr | Standard-default |
| Max tickets per spiller | Engine arm-validering | 4 standard | 30 max via `ticketSelections` |
| Pause mellom runder | `PERPETUAL_LOOP_DELAY_MS` | 30 000 ms (30 s) | Env-overstyrbar |
| Pause mellom baller | `AUTO_DRAW_INTERVAL_MS` | 2 000 ms (2 s) | Env-overstyrbar |
| Total runde-syklus | Beregnet | ~72 s | 21 × 2 s + 30 s pause |
| Jackpot-skala | `DEFAULT_GAME2_CONFIG.jackpotNumberTable` | Se §5 | Hall kan overstyre via `hall_game_schedules.variant_config` |

---

## 4. Ticket types

**Kun én type** (`standard`): 3×3 grid, 9 celler, tall fra 1..21. Vekt 1.

```typescript
ticketTypes: [
  { name: "Standard", type: "game2-3x3", priceMultiplier: 1, ticketCount: 1 },
]
```

Legacy hadde `Game2BuyBlindTickets` (kjøp uten forhåndsvisning) — ikke portet.

Ticket-kjøpet følger samme `TicketSelection[]`-kontrakt som G1
(`shared-types/socket-events.ts`):

```ts
interface TicketSelection { type: string; qty: number; }
```

For G2 sendes `{ type: "standard", qty: n }` med 1 ≤ n ≤ 30.

---

## 5. Win-patterns og jackpot-skala

**Kun ett win-pattern: Full plate** (alle 9 celler markert). `prizePercent: 100`
i config, men premien beregnes fra jackpot-skala (ikke prosent av pool).

| draws når full plate vinnes | Premie | Kommentar |
|-----------------------------|--------|-----------|
| 9 | 50 kr | Minimum (alle 9 celler matchet på første 9 baller) |
| 10 | 100 kr | |
| 11 | 250 kr | |
| 12 | 500 kr | |
| 13 | 1 000 kr | |
| 14–21 | 2 500 kr | Maksimal jackpot |

Implementert via `jackpotNumberTable` i `DEFAULT_GAME2_CONFIG`. Slot-semantikk:
nøkkel = exact draw-count når full plate vinnes; `"1421"` matcher draw-count
i [14..21]-intervallet.

**Lucky Number-bonus:** Spilleren velger ett tall (1..21) ved kjøp. Hvis full
plate vinnes på en runde der siste trukne ball er spillerens Lucky Number,
utløses en bonus i tillegg til jackpot-premien. Fast bonus-beløp er
hall-konfigurerbart via `variantConfig.luckyNumberPrize`.

`patternEvalMode: "auto-claim-on-draw"` — engine sjekker etter hver draw og
auto-utløser claim når en spiller har full plate. Ingen manuell "Bingo!"-
knapp.

---

## 6. Mini-games

**Game 2 har ingen mini-games.** `miniGames: []` i front-matter.

Dette skiller G2 fra G1 (Wheel/Chest/Mystery/ColorDraft) og G5 (rulett).
Avviket er bevisst — Spill 2 er rent jackpot-tallspill.

---

## 7. Audio

**Lydfiler ikke portet** (MVP-begrensning per `game2/README.md`).
`audioVoicePacks: []`. Egen issue når G2 prioriteres for full release.

---

## 8. UI og animasjoner

| Animasjon | Parametre | Utløser |
|-----------|-----------|---------|
| Countdown pulse | GSAP scale + color, varierende frekvens | Active countdown før RUNNING |
| Cell mark | scale 1 → 1.15 → 1, 0.4 s | Tall trekkes og matcher en celle |
| Jackpot-bar | 6 slots over ticket-grid (9/10/11/12/13/14-21) | Highlight slot for current draw-count |
| Lucky Number-marker | Egen highlight på valgt tall | Persistent under hele runden |
| Buy-popup overlay | Slide-in fra bunn / fade | LOBBY/WAITING/RUNNING-faser |
| Bong-fjerning ved ENDED | Fade-ut | Umiddelbart når runde slutter |

Tidligere "rakett-stabling"-animasjon (LeanTween → GSAP) er **fjernet
2026-05-03** (Tobias-direktiv) — Spill 2 har ingen rakett-tematikk per
PDF 17 wireframe. `RocketStack.ts` + `rocket.png` slettet. Erstattet av
Jackpot-bar med 6 slots.

---

## 9. Kjøp-flyt (BuyPopup)

| Fase | BuyPopup-status | Tittel |
|------|-----------------|--------|
| LOBBY | Synlig | "Neste spill" |
| WAITING | Synlig | "Neste spill" |
| RUNNING | Synlig | "Forhåndskjøp – neste runde" |
| ENDED → ny runde | Bonger fjernes umiddelbart | — |

Eksplisitt kjøp via BuyPopup. Ingen auto-arm. Når spilleren har valgt brett
+ Lucky Number sendes `bet:arm` med selections.

`preRoundTickets` (state) populerer pre-bought brett som vises som preview
før neste runde starter, deretter erstattes av `myTickets` ved arm.

---

## 10. Rom-modell

**ETT globalt rom** med fast roomCode `ROCKET` (referanse:
`apps/backend/src/util/canonicalRoomCode.ts`). Alle haller deler dette
rommet — det finnes aldri flere `rocket`-rom samtidig.

`RoomUniquenessInvariantService` håndhever invarianten:
- Spill 2: ETT globalt rom per slug — duplikater detekteres + konsolideres
  ved boot og periodisk tick
- Strukturert log: `event=DUPLICATE_GLOBAL_ROOM`

Konsekvenser:
- Ingen master/start/stop-flow
- Ingen group-of-halls-koordinering
- Spilleplan irrelevant — alltid på (perpetual loop)
- Compliance-binding: kjøp bindes til kjøpe-hall via `actor_hall_id`
  (samme som Spill 1 — multi-hall-bug fix per PR #443)

---

## 11. Socket-kontrakt

Deler kontrakt med G1 + G3 + G5 via `packages/shared-types/src/socket-events.ts`.
Ingen G2-unike events i ny stack.

**Client → Server:**
- `room:join` med `gameSlug: "rocket"` (eller `roomCode: "ROCKET"`)
- `bet:arm` med `{ armed, ticketSelections }`
- `lucky-number:select` med `{ number: 1..21 }`

**Server → Client:**
- `room:update`, `draw:new`, `pattern:won`, `wallet:balance`, `chat:*`

Zod-schemas (BIN-545) dekker delte payloads. Drawindex-gap-deteksjon
(BIN-502) fungerer automatisk for G2 fordi `GameBridge` er delt.

---

## 12. Checkpoint og recovery

Samme som G1/G3/G5: persist ved hver draw, recovery fra snapshot ved
reconnect. `BINGO_CHECKPOINT_ENABLED=true` default.

Event-buffer (BIN-501) ikke levert — gjelder alle spill, ikke G2-spesifikt.

---

## 13. Kjente avvik fra legacy og Spill 1

### 13.1 Avvik mot legacy Game 2

| Legacy-feature | Status i ny stack | Notat |
|----------------|-------------------|-------|
| `Game2BuyBlindTickets` | ❌ Ikke portet | Vurderes etter pilot |
| `Game2PlanList` (hall-schedule) | ❌ Ikke relevant — Spill 2 har ETT globalt rom | Bevisst valg |
| Rakett-tematikk | ❌ Fjernet 2026-05-03 | Tobias-krav |
| Chat (`SendGameChat`, `GameChatHistory`) | ✅ Portet (delt G1-komponent + BIN-516 persistens) | — |
| Lydfiler / nummerannouncement | ❌ Ikke portet | Egen issue |

### 13.2 Avvik mot Spill 1

| Aspekt | Spill 1 | Spill 2 |
|--------|---------|---------|
| Rom-modell | Per group-of-halls med master | **ETT globalt rom (`ROCKET`)** |
| Master/start/stop | Ja | **Nei** — alltid på, perpetual loop |
| Ticket-typer | 8 farger | **1 type** ("Standard") |
| Mini-games | Wheel/Chest/Mystery/ColorDraft | **Ingen** |
| Schedule | Per-hall vindu | **Ingen** — alltid på |
| Grid | 5×5 (med fri sentercelle) | **3×3** (alle 9 celler reelle) |
| Ball-range | 1–75 | **1–21** |
| Win-patterns | Row 1-4 + Coverall | **Full plate eneste pattern** |
| Premie-modell | Prosent av pool | **Jackpot-skala** (50 → 2 500 kr) |
| Lucky Number-bonus | Bonus ved Fullt Hus på lucky-ball | **Bonus ved full plate hvis siste ball er Lucky Number** |
| Pause mellom runder | Master-styrt | **30 s automatisk** |
| Pause mellom baller | Per-room config | **2 s globalt** |

### 13.3 Delte avvik (gjelder alle spill)

Se [PARITY_MATRIX.md](PARITY_MATRIX.md) §2.3 for delte rader.

---

## 14. Filer (primærreferanser)

**Backend:**
- `apps/backend/src/game/BingoEngine.ts` — rom-lifecycle, draws, claims
- `apps/backend/src/game/variantConfig.ts` — `DEFAULT_GAME2_CONFIG`
  (3×3 / 1..21 / jackpot-skala / 1 ticket-type)
- `apps/backend/src/game/PerpetualRoundService.ts` — auto-restart med 30 s
  delay
- `apps/backend/src/util/canonicalRoomCode.ts` — `ROCKET` global-room
  håndhevelse
- `apps/backend/src/sockets/gameEvents.ts` — socket-handlere

**Klient (G2-spesifikk):**
- `packages/game-client/src/games/game2/Game2Controller.ts` — state-maskin
- `packages/game-client/src/games/game2/screens/PlayScreen.ts` — gameplay-UI
  (jackpot-bar + ticket-grid + chat + BuyPopup)
- `packages/game-client/src/games/game2/components/TicketCard.ts` — 3×3 grid
- `packages/game-client/src/games/game2/components/BuyPopup.ts` — kjøp-UI
- `packages/game-client/src/games/game2/components/JackpotBar.ts` — 6-slot
  jackpot-indikator

**Delt klient:**
- `packages/game-client/src/components/ChatPanel.ts` — chat (delt med G1/G3)
- `packages/game-client/src/bridge/GameBridge.ts` — snapshot → state
- `packages/game-client/src/net/SpilloramaSocket.ts` — socket-wrapper

**Legacy (referanse):**
- `legacy/unity-backend/Game/Game2/Sockets/game2.js`
- `legacy/unity-client/Assets/_Project/_Scripts/Panels/Game/Game 2/`

---

## 15. Redigerings-policy

PR som endrer G2-adferd MÅ oppdatere denne filen i samme PR.

**Parity-matrix-generator** (planlagt) leser YAML front-matter — ikke endre
felt-struktur uten å oppdatere generatoren.

---

## 16. Revisjonshistorikk

| Dato | Endring |
|------|---------|
| 2026-04-17 | Initial canonical spec per BIN-529 — beskrev 3×5 / 1..60 / line+full-card. Aldri i takt med kode etter PR #873. |
| 2026-05-03 | PR #873/#893: rakett-tematikk fjernet, jackpot-bar innført, BuyPopup-flyt etablert. |
| 2026-05-04 | **Komplett rewrite per Tobias-direktiv** — 3×3 grid, 1..21 baller, full plate eneste pattern, jackpot-skala (50/100/250/500/1000/2500), Lucky Number-bonus, ETT globalt rom (`ROCKET`), perpetual loop med 30 s pause + 2 s mellom baller. Reflekterer faktisk produksjonskode. |
