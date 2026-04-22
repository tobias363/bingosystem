# Changelog

Alle merkbare endringer i dette prosjektet dokumenteres her.

## [0.7.0-pilot-prep] - 2026-04-22

### Added — Spor 1: Post-pilot Spill 1-varianter (4 nye winning-types)

- **PR-P2** `multiplier-chain` (Spillernes spill, #353): Rad N = Rad 1 × N, med per-farge `phase1BaseCache`. Gulv via `minPrizeNok`.
- **PR-P3** `column-specific` (Super-NILS, #358): Fullt Hus-premie basert på B-I-N-G-O-kolonne av siste trukne kule. `ballToColumn()`-helper eksportert.
- **PR-P4** `ball-value-multiplier` (Ball × 10, #360): `baseFullHousePrize + lastBall × ballValueMultiplier`.
- **PR-P5** `concurrent customPatterns` (Extra, #365): utvider pattern-array til samtidige 25-bit bitmask-patterns. Mutually exclusive med standard `patternsByColor`. UI-editor utsatt til P5b.

### Added — Spor 3: Minispill-framework (fullt implementert runtime)

- **PR-M1** framework (#351): `MiniGamesConfigService` + admin-CRUD for 4 mini-games per hall.
- **PR-M2** Wheel (#355): Lykkehjulet med server-autoritativ RNG + legacy-paritet (50 buckets).
- **PR-M3** Chest (#362): Skattekisten med N-luke klient-valg.
- **PR-M4** Colordraft (#364): Fargekladden med seeded state-rekonstruksjon (sha256 av resultId).
- **PR-M5** Oddsen (#368): Cross-round state — forrige vinner velger 55/56/57, utbetales i neste spill.

### Added — Fysisk bong (backend komplett, admin-UI delvis)

- **PT1** (#352): `StaticTicketService` + CSV-import med atomisk all-or-nothing validering.
- **PT2** (#356): `AgentTicketRangeService.registerRange` + `closeRange` via Bluetooth-scan-API.
- **PT3** (#361): `recordBatchSale` — current-top-scan → batch-UPDATE av solgte bonger bundet til neste spill.
- **PT4** (#367): `PhysicalTicketPayoutService` med fire-øyne for premier ≥ 5000 kr + `physical_ticket_won`-socket-event.
- **PT5** (#370): `handoverRange` (vakt-skift) + `extendRange` (påfylling).

### Added — Wallet-split (5 PR-serie komplett, regulatorisk §11)

- **W1** schema (#354): `deposit_balance` + `winnings_balance` som NUMERIC(20,6) i kroner. `balance` er GENERATED sum. CHECK-constraints enforcer `winnings = 0` for system-kontoer.
- **W2** credit-aktivering (#357): Game1PayoutService + Game1MiniGameOrchestrator → `to: "winnings"`. Refund + topup → `to: "deposit"`. Admin-gate HTTP 403 `ADMIN_WINNINGS_CREDIT_FORBIDDEN`.
- **W3** transfer targetSide (#363): utvidet `transfer()` slik at Spill 2/3-payouts også lander på winnings-balanse.
- **W4** loss-limit-fix + header-UI (#366): `recordLossEntry({type:"BUYIN"})` mottar kun `fromDepositCents` per §11. WalletViewPage + WalletListPage viser split.
- **W5** admin-correction UI (#369): modal med winnings-disabled + tooltip. Game1TicketPurchaseService BUYIN-gap fikset via `ComplianceLossPort`.

### Added — Spor 4: Pot-mekanikker (fundament)

- **PR-T1** `Game1PotService` (#371): akkumulerende pot-er med `app_game1_accumulating_pots` + `app_game1_pot_events` (append-only audit). 6 metoder: `getOrInitPot`, `accumulateDaily`, `accumulateFromSale`, `tryWin`, `resetPot`, `updateConfig`. T2 Jackpott + T3 Innsatsen-integrasjon i arbeid.

### Added — Verifikasjon + dokumentasjon

- **Netto-tap-regresjonstest** (#350): beskytter mot brutto-regresjon i `ComplianceManager.calculateNetLoss`. Verifisert av agent 2026-04-22 at koden er korrekt.
- **Kvikkis sub-variant** (#349): hurtig-bingo uten Rad 1-4 (kun Fullt Hus).
- **GAME1_SCHEDULE PR-serie** (#297, #300, #301, #312, #313): auto-scheduler + ticket-purchase-foundation + master-console + crash recovery + loyalty hook.
- **Unity purge** (#299, #304): fjernet all Unity-kode + DB drop-column-migrering.
- **Docs/runbooks**: `PHYSICAL_TICKETS_FINAL_SPEC`, `WALLET_SPLIT_DESIGN`, `PILOT_LIVE_RUNBOOK`, `PM_STATUS_2026-04-22`.

### Changed

- Admin kan IKKE kreditere til winnings (aktivt regulatorisk gate i W2).
- Payout-serialisering: alle 3 spillengines (Game1, Game2, Game3) bruker nå `targetSide: "winnings"`-transfer.
- Pattern-evaluator støtter nå både sekvensielle faser OG concurrent custom patterns.

### Removed

- 6 stale PR-er lukket (#104, #105, #162, #221, #241, #302) — superseded av merged work.
- Unity-referanser i docs + kode (PR #304).

### Verification

- `npm --prefix apps/backend run check` — grønt
- `npm --prefix apps/backend run test` — ~3700 tester grønne, 9 skipped
- `npm --prefix apps/admin-web run test` — ~750 tester grønne
- CI workflows: `backend`, `admin-web`, `compliance` alle pass på hver PR

---

## [0.2.0-wave1] - 2026-03-04

### Added

- Compliance gate workflow i GitHub Actions: `.github/workflows/compliance-gate.yml`.
- Egen compliance test-suite: `backend/src/compliance/compliance-suite.test.ts`.
- Nytt backend dev-script for single-watch oppsett: `backend/scripts/dev-single.sh` (`npm run dev:single`).
- Operasjonsdokumenter for pilot/utrulling/sign-off:
  - `HALL_PILOT_RUNBOOK.md`
  - `ROLLOUT_PLAN_1_3_20.md`
  - `P0_SIGNOFF.md`
  - `WAVE1_GO_NO_GO_SIGNOFF_2026-03-09.md`
  - `RELEASE_PACKAGE_WAVE1.md`
  - `RELEASE_NOTES_WAVE1.md`

### Changed

- Spillorama-klient:
  - Play-knapp kan starte + drive realtime runde via `PlayRealtimeRound`.
  - Bedre guardrails for join/create-pending og auth-bootstrap.
  - Bedre editor-sikkerhet for manglende scripts før Play Mode.
- Backend:
  - Laster `.env` eksplisitt via `dotenv`.
  - Ny policy `BINGO_MIN_PLAYERS_TO_START` med miljøstyrt minstegrense.
  - `BingoEngine` støtter konfigurerbar `minPlayersToStart`.
  - Scheduler håndterer `PLAYER_ALREADY_IN_RUNNING_GAME` mer robust i dev.

### Verification

- `npm --prefix backend run check`
- `npm --prefix backend run build`
- `npm --prefix backend run test`
- `npm --prefix backend run test:compliance`
