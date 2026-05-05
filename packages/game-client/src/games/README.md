# Module: `packages/game-client/src/games`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen

## Ansvar

Per-spill rendering og UI-flow:
- `game1/` — Spill 1 (75-ball 5×5, master-styrt per hall)
- `game2/` — Spill 2 (21-ball 3×3, perpetual ROCKET)
- `game3/` — Spill 3 (75-ball 5×5 uten free, perpetual MONSTERBINGO)
- `game5/` — SpinnGo (Spill 4) — under utvikling
- `registry.ts` — game-slug → game-component-mapping

## Ikke-ansvar

- Server-state (server er sannhets-kilde)
- Cross-game logic (eksisterer i `core/`)

## Public API

Hvert game-folder eksporterer:
- `<Game>Controller` — main entry point (kalles fra `main.ts` via `registry.ts`)
- `<Game>PlayScreen` — primær Pixi-stage
- Mini-game-komponenter (kun `game1/`)

`registry.ts` mapper game-slug (`bingo`, `rocket`, `monsterbingo`, `spillorama`) til
controller-klassen.

## Per-spill struktur

Hvert game-folder har:
- `<Game>Controller.ts` — orkestrerer scenes, state-overganger
- `<Game>PlayScreen.ts` — hovedspillvisning (Pixi-stage)
- `<Game>EndOfRoundOverlay.ts` — vinner-skjerm
- `MiniGame*` (Spill 1 only) — Wheel/Chest/Mystery/ColorDraft

## Invariants

1. **Spill 1 ≠ Spill 2/3 livsmønster:**
   - Spill 1 er per-hall, master-styrt
   - Spill 2/3 er globalt rom, perpetual loop
   - Ikke bland abstraksjoner
2. **PlayScreen for ALLE faser** (PR #923): bonger + Innsats synlig under countdown
3. **Buy-popup unified** (PR #926): Game1BuyPopup brukes for alle tre spill
4. **Audio-events fra server:** Lokal audio-trigger basert på socket-events, ikke timer

## Bug-testing-guide

### "Spill 2 'henger' og kaster assertHost-error"
- Bekreft du IKKE arvet assertHost-check fra Spill 1
- Se PR [#942](https://github.com/tobias363/Spillorama-system/pull/942)

### "Bonger vises ikke når jeg åpner spill"
- Sjekk `myTickets` vs `preRoundTickets` (PR #923)
- Verifiser `room.state` er korrekt

## Referanser

- `docs/architecture/SPILLKATALOG.md` (autoritativ)
- `docs/architecture/modules/frontend/`
- ADR-001 (perpetual rom)
