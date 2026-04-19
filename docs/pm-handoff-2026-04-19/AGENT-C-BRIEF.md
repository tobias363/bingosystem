# AGENT C BRIEF — Game 2 + Game 3 backend-paritet

**Prosjektleder:** Claude Opus (brave-dirac-worktree)
**Din rolle:** backend-agent — port G2 (Rocket/Tallspill) + G3 (Mønsterbingo) spillmekanikk
**Working directory:** `/Users/tobiashaugen/Projects/Spillorama-system/.claude/worktrees/slot-C`
**Base branch:** `origin/main` (oppdatert 2026-04-19)

**Linear:** [BIN-615](https://linear.app/bingosystem/issue/BIN-615) parent
**Mandat:** 100% funksjonell 1:1 paritet av legacy G2/G3 backend-mekanikk.

**Audit:** `/tmp/game2-game3-backend-audit.md` — les FØRST.

---

## 1. Forutsetninger

### 1.1 Worktree
```bash
cd /Users/tobiashaugen/Projects/Spillorama-system
git worktree add .claude/worktrees/slot-C origin/main
cd .claude/worktrees/slot-C
```

### 1.2 Kildesannhet (les kun)
- `legacy/unity-backend/Game/Game2/Controllers/` — G2 logic
- `legacy/unity-backend/Game/Game2/Services/` — G2 services
- `legacy/unity-backend/Game/Game3/Controllers/` — G3 logic
- `legacy/unity-backend/Game/Common/` — shared
- `legacy/unity-backend/gamehelper/game2.js` — G2 helpers (jackpot-table)
- `legacy/unity-backend/gamehelper/game3.js` — G3 helpers (pattern-matching)
- `legacy/unity-backend/Helper/bingo.js` — bingo-common (drawbag, ticket-gen)

### 1.3 Ny backend (utvid)
- `apps/backend/src/game/BingoEngine.ts` — generisk engine (må utvides)
- `apps/backend/src/game/variantConfig.ts` — variant-config (utvides med G2/G3)
- `apps/backend/src/game/types.ts`, `ticket.ts`
- `apps/backend/src/sockets/gameEvents.ts` — kan trenge utvidelse for PatternChange, JackpotListUpdate osv.

---

## 2. Din scope — 3 PR-er (16-22 dev-dager)

### PR-C1 — Delt infrastruktur (3-5 dager, FØRST)

**Scope:**
- **Sub-game sekvens-abstraksjon** — `createChildGame` pattern for CH_1_G2, CH_2_G2... Port fra `Common/Controllers/GameController.js:334-521`
- **Drawbag-abstraksjon** — utvid fra `MAX_BINGO_BALLS_60` / `MAX_BINGO_BALLS_75` til config-drevet (f.eks. G2 bruker 1..21)
- **Ball-range per variant** — variant_config utvides med `maxBallValue`, `drawBagStrategy`

**Filer:**
- `apps/backend/src/game/BingoEngine.ts` — utvid
- `apps/backend/src/game/variantConfig.ts` — nye felt
- `apps/backend/src/game/SubGameManager.ts` (ny)
- Migrations hvis nye tabeller

**AC:**
- Tester for sub-game sekvens (parent → child1 → child2 → ...)
- Drawbag fungerer for 1..21, 1..60, 1..75 via config
- Ingen regresjon på G1 (alle G1-tester fortsatt grønne)

### PR-C2 — Game 2 Rocket/Tallspill (6-8 dager, etter PR-C1)

**Unity/legacy-refs:**
- `Helper/bingo.js:996-1012` — 3x3 ticket-generering
- `gamehelper/game2.js:1466-1625` — jackpot-number-table
- `Game/Game2/Controllers/GameController.js` — spill-flyt
- `Game/Game2/Controllers/GameProcess.js` — draw-prosess

**Scope:**
- **3x3-grid ticket-struktur** — 9 celler, tall 1-21, brukeren velger eller får random
- **Drawbag 1..21** (bruker PR-C1-abstraksjon)
- **Jackpot-table** — per-draw-mapping:
  - Draw 9 → 25000 kr fast prize
  - Draw 14-21 → 5% av pool
  - Implementer som `JackpotTableConfig` i variant_config
- **Rocket-launch mekanikk** — når spiller når "full 3x3" trigger rocket-event (socket: `Game2RocketLaunch`)
- **TicketCompleted** socket-event
- **JackpotListUpdate** socket-event ved hver trekk
- Claim-validering tilpasset 3x3

**Filer:**
- `apps/backend/src/game/Game2Engine.ts` (ny, ekstensjon av BingoEngine)
- `apps/backend/src/game/Game2JackpotTable.ts` (ny)
- `apps/backend/src/sockets/game2Events.ts` (hvis spesifikke events)
- Utvid variantConfig med G2-config

**AC:**
- Spiller kan kjøpe 3x3 ticket
- Trekking 1..21, matching oppdaterer ticket-state
- Jackpot trigger ved draw 9 og 14-21 per legacy-regler
- Rocket-launch når ticket komplett
- Wire-contract-tester

### PR-C3 — Game 3 Mønsterbingo (7-10 dager, etter PR-C1)

**Unity/legacy-refs:**
- `gamehelper/game3.js:724-848` — pattern-matching + auto-claim
- `Game/Game3/Controllers/GameController.js` — spill-flyt
- `App/Views/patternManagement/` — admin konfigurerer patterns (allerede håndtert av admin-UI-porten)

**Scope:**
- **Custom pattern-matching** — 25-bitmask per pattern, match mot 5x5-grid
- **Dynamisk pattern-cycling** — patterns har `ballNumberThreshold` — aktiveres/deaktiveres under runden basert på antall trekk
- **Auto-claim** — når pattern matches server-side, auto-claim uten brukerinput (ingen bingo-knapp)
- **PatternChange** socket-event — broadcast når pattern-liste endres midt i runden
- **Multi-pattern per round** — én runde kan ha flere aktive patterns samtidig

**Filer:**
- `apps/backend/src/game/Game3Engine.ts` (ny)
- `apps/backend/src/game/PatternMatcher.ts` (ny — bitmask matching)
- `apps/backend/src/game/PatternCycler.ts` (ny — ballNumber-threshold)
- Utvid socket-events

**AC:**
- Admin kan lagre custom 25-bitmask patterns (backend-støtte; UI i admin-port)
- Server matcher automatisk og auto-claimer
- PatternChange-event kringkastes korrekt
- Tester for diverse pattern-varianter (linjer, X, T, perimeter, osv.)

---

## 3. Regler

### Filer du eier
- `apps/backend/src/game/BingoEngine.ts` (utvidelser)
- `apps/backend/src/game/variantConfig.ts` (utvidelser for G2/G3)
- `apps/backend/src/game/Game2*.ts`, `Game3*.ts`, `SubGameManager.ts`, `PatternMatcher.ts`, `PatternCycler.ts`
- Migrations for G2/G3-spesifikke tabeller hvis nødvendig

### Filer du IKKE rører
- `apps/admin-web/**` (Agent A + B)
- `packages/game-client/**` (Agent 5 når G2/G3-klient startes)
- `apps/backend/src/routes/**` (kun utvid ved nødvendig)

### Stack
- TypeScript strict
- Bygger på eksisterende BingoEngine-mønster
- Ingen nye npm-deps uten godkjenning

### Kodestil
- Commit: `feat(game2): PR-C<n> <topic>` eller `feat(game3): ...`
- Max 1500 linjer diff per PR (splitt hvis større)
- Alle nye services: unit-tester minimum

---

## 4. Test-regime

```bash
cd apps/backend
npm run check    # tsc strict
npm test         # alle tester må passere (ingen G1-regresjoner)
```

Spesielt viktig: **G1-regresjonstester må være grønne** etter hver PR siden du utvider samme engine.

---

## 5. Rapport-kadens

**Etter hver PR:**
1. PR URL
2. Scope levert + legacy fil:linje-refs
3. Nye tabeller/migrations
4. Test-count (før/etter)
5. Socket-events lagt til (hvis noen)
6. Avvik fra legacy (hvis noen, med begrunnelse)
7. Neste PR foreslått
8. **Stopp-og-vent**

---

## 6. Kritiske "ikke gjør"

- Ikke merge direkte — alltid PR
- Ikke bryt G1-regresjonstester — kjør `npm test` grundig før push
- Ikke legg til npm-deps uten godkjenning
- Ikke rør admin-web eller game-client
- Ved tvil: stopp og spør PM

---

## 7. Første konkrete handling

1. Opprett slot-C worktree:
```bash
cd /Users/tobiashaugen/Projects/Spillorama-system
git worktree add .claude/worktrees/slot-C origin/main
cd .claude/worktrees/slot-C
```

2. Les grundig:
   - `/tmp/game2-game3-backend-audit.md`
   - `legacy/unity-backend/Game/Common/Controllers/GameController.js` (sub-game pattern)
   - `legacy/unity-backend/Game/Game2/Controllers/GameController.js`
   - `legacy/unity-backend/Game/Game3/Controllers/GameController.js`
   - `apps/backend/src/game/BingoEngine.ts`
   - `apps/backend/src/game/variantConfig.ts`

3. Rapporter PR-C1-plan:
   - Hvilke utvidelser i BingoEngine
   - Nye filer du vil opprette
   - Migrations (hvis nødvendig)
   - Test-strategi
   - Spørsmål til PM hvis noe er uklart

4. Vent på PM-review, deretter kode.

---

## 8. Parallellisering med Admin-UI

- **Agent A (slot-A)** jobber på admin-UI shell og spillplan/rapport
- **Agent B (slot-B)** jobber på admin-UI player/cash-inout
- **Du (Agent C, slot-C)** jobber på G2/G3 backend

**Ingen fil-overlapp** — dere tre jobber i helt forskjellige mapper.

- Admin-UI trenger G2/G3 pattern-admin side (admin-UI-agent bygger UI, du har backend klart)
- Koordineres via PM ved behov

---

## 9. Estimat

| PR | Dager |
|----|-------|
| PR-C1 Delt infra (sub-games + drawbag) | 3-5 |
| PR-C2 Game 2 Rocket/Tallspill | 6-8 |
| PR-C3 Game 3 Mønsterbingo | 7-10 |
| **Total** | **16-23 dev-dager ≈ 3-4.5 uker** |

---

## 10. Ved problem

Ping PM med:
- PR-nummer
- Konkret legacy-ref (fil:linje)
- Feilmelding
- Hva du har prøvd
