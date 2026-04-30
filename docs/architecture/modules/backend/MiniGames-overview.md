# Mini-Games Framework Overview

**Folder:** `apps/backend/src/game/minigames/`
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Spor-3 mini-game framework for scheduled Spill 1 — a typed plug-in system where each mini-game is an isolated implementation of the `MiniGame` interface, registered with `Game1MiniGameOrchestrator`, and triggered post-Fullt-Hus. The orchestrator owns lifecycle (trigger → broadcast → choice → resolve → payout → audit), and individual engines implement game-specific logic with server-authoritative RNG and admin-driven config.

The framework is SEPARATE from `BingoEngineMiniGames` (which is the host-player-room ad-hoc mini-game path). This folder is the scheduled-game framework introduced by BIN-690 (M1-M6) and used by `Game1DrawEngineService.maybeTriggerMiniGameForFullHouse`.

## Structure

```
apps/backend/src/game/minigames/
├── types.ts                              (171 LOC — framework contracts)
├── Game1MiniGameOrchestrator.ts          (1140 LOC — lifecycle coordinator)
├── MiniGameWheelEngine.ts                (357 LOC — M2 Wheel)
├── MiniGameChestEngine.ts                (472 LOC — M3 Chest)
├── MiniGameColordraftEngine.ts           (556 LOC — M4 Colordraft)
├── MiniGameOddsenEngine.ts               (950 LOC — M5 Oddsen, cross-round)
├── MiniGameMysteryEngine.ts              (605 LOC — M6 Mystery, multi-round)
└── *.test.ts + *.integration.test.ts     (≈6500 LOC tests)
```

## Files

### `types.ts`
The framework contract — defines `MiniGameType` discriminator union (`"wheel" | "chest" | "colordraft" | "oddsen" | "mystery"`), `MiniGame` interface (`trigger(context) → TriggerPayload`, `handleChoice(input) → MiniGameResult`), `MiniGameTriggerContext` (resultId, scheduledGameId, winnerUserId, walletId, hallId, drawSequenceAtWin, configSnapshot), `MiniGameChoiceInput`, `MiniGameTriggerPayload`, `MiniGameResult`. The `MiniGameType` union here is DISTINCT from `BingoEngineMiniGames.MiniGameType` (legacy host-player-room scoped) — they're separate frameworks. Also exports `MINI_GAME_TYPES` for iteration/validation.

### `Game1MiniGameOrchestrator.ts`
Lifecycle coordinator — methods:
- `maybeTriggerFor(input)` — called fire-and-forget from `Game1DrawEngineService` post-Fullt-Hus commit. Resolves config from `app_mini_games_config.config_json`, picks next type via FIFO rotation, INSERT `app_game1_mini_game_results (status='triggered')`, broadcasts `mini_game:trigger` to winner.
- `handleChoice(resultId, userId, choiceJson)` — called from socket handler when client responds. Checks ownership + idempotency (`completed_at IS NULL`), dispatches to the registered engine's `handleChoice`, performs wallet credit (`to: "winnings"`, idempotency-key `g1-minigame-{resultId}`), UPDATE result row + payout_cents + completed_at in one transaction, broadcasts `mini_game:result`.
- `listPending(...)`, `listPendingForUser(...)`, `resumePendingForUser(userId)` — disconnect-recovery (PR #592 MED-10) to re-trigger pending mini-games when client reconnects.

Server-authoritative — clients can only suggest indices, never determine payout. Fire-and-forget on trigger so mini-game failures don't roll back the draw transaction. Audit-event `game1_minigame.trigger_failed` / `game1_minigame.completed` per outcome.

### `MiniGameWheelEngine.ts` (M2 — PR #355)
Wheel-of-fortune — N buckets (default 50) split across prize tiers (e.g. 2×4000 + 4×3000 + 8×2000 + 32×1000 + 4×500 kr). Player presses "Snurr" (no actual choice — `choiceJson` is empty/ignored); server uniformly draws one bucket via `crypto.randomInt`. `trigger` returns bucket-preview without revealing winning index. `handleChoice` weighted-trekt vinning bucket og returnerer `winningBucketIndex + amount + animationSeed`. Default config in `DEFAULT_WHEEL_CONFIG` constant. Crypto-secure RNG (matches draw-engine pattern).

### `MiniGameChestEngine.ts` (M3 — PR #355)
Treasure-chest — N chests (default 6), each with hidden value uniform in [400, 4000] kr (or weighted via optional `discreteTiers`). Player sends `{ chosenIndex: N }`; server draws all N values via `crypto.randomInt`, picks `value[chosenIndex]`. Returns `chosenIndex + prizeAmount + allValues + chestCount`. Anti-juks safety: client only sees `chestCount` + `prizeRange` in trigger; actual values are hidden until choice. Default config in `DEFAULT_CHEST_CONFIG`.

### `MiniGameColordraftEngine.ts` (M4 — PR #364)
Color-draft — N slots (default 12) each tinted with a color from admin's palette. Server pre-draws a `targetColor` AND assigns `slotColors[]` deterministically via `resultId`-seeded RNG (so trigger-state is reconstructable in `handleChoice` without persisting). Player sends `{ chosenIndex: N }`; match → full prize, mismatch → consolation (often 0). Anti-juks rationale: this IS a skill-puzzle (target visible in trigger); client cannot manipulate payout, only chosen index.

### `MiniGameOddsenEngine.ts` (M5 — PR #368, BIN-690)
Cross-round odds — UNIQUE among the engines because resolution happens in a LATER scheduled-game's draw, not at choice-time. Player picks one of `[55, 56, 57]`; choice is persisted in `app_game1_oddsen_state` per-hall. When the next scheduled-game in the same hall reaches its threshold draw (default 57), `Game1DrawEngineService.drawNext` calls `MiniGameOddsenEngine.resolveForGame` IN-TRANSACTION — if `chosenNumber ∈ drawnNumbers`, wallet credit pot (small/large depending on ticket-size at original Fullt Hus); else miss. Idempotency key `g1-oddsen-{oddsenStateId}` (NOT the orchestrator scope) to prevent double-credit on draw retry. `expireStateForGame` cron cleans up unresolved state (post-pilot).

### `MiniGameMysteryEngine.ts` (M6 — PR #430)
5-round opp/ned + joker — server draws `middleNumber` + `resultNumber` (each 5-digit in [10000, 99999]) deterministically via `resultId`-seeded RNG. Player makes 5 UP/DOWN choices, one per digit comparison (right-to-left). UP + resultDigit > middleDigit ⇒ correct (priceIndex++); DOWN + resultDigit < middleDigit ⇒ correct; resultDigit == middleDigit ⇒ JOKER (auto-win, priceIndex = max, end). priceIndex is clamped in [0, 5] and indexes into `prizeListNok` (default `[50, 100, 200, 400, 800, 1500]`). Single-call multi-round (client sends all 5 directions[] in one `handleChoice`). 1:1 port from legacy Unity `MysteryGamePanel.cs`.

## Dependencies (framework-wide)

**Calls (downstream):**
- `WalletAdapter.credit(walletId, amount, reason, { idempotencyKey, to: "winnings" })` — payout via orchestrator only. Engines NEVER transfer.
- `ComplianceLedgerPort.recordPrizeEvent(...)` (M5+ writes) — PRIZE entries.
- `PrizePolicyPort.assertWithinSinglePrizeCap(...)` — 2500 kr §11 enforcement.
- `AuditLogService.record(...)` — `game1_minigame.completed` / `*.trigger_failed`.
- `pg.Pool` directly — orchestrator + Oddsen are Postgres-backed.
- `crypto.randomInt` — server-authoritative RNG (matches `Game1DrawEngineService` pattern).
- `crypto.createHash` (M4 Colordraft, M6 Mystery) — `resultId`-seeded deterministic RNG for state reconstruction without persistence.
- `MiniGameBroadcaster` (`NoopMiniGameBroadcaster` default) — socket emission for `mini_game:trigger` + `mini_game:result`.

**Called by (upstream):**
- `apps/backend/src/index.ts` — boot wiring; instantiates orchestrator + each engine; registers engines via constructor injection.
- `apps/backend/src/game/Game1DrawEngineService.ts` — `setMiniGameOrchestrator(orchestrator)` + `setOddsenEngine(engine)` late-binding. Calls `orchestrator.maybeTriggerFor(...)` post-Fullt-Hus and `oddsenEngine.resolveForGame(...)` at threshold-draws.
- `apps/backend/src/sockets/miniGameSocketWire.ts` — wires `mini_game:choice` socket event to `orchestrator.handleChoice`.
- `apps/backend/src/agent/AgentMiniGameWinningService.ts` — admin/agent view of mini-game results.
- `apps/backend/src/routes/agentGame1MiniGame.ts` — REST endpoints for agent operations.

## Invariants

- Server-authoritative — RNG is `crypto.randomInt`. Clients suggest only indices/directions; payout is server-determined.
- Idempotency:
  - Orchestrator credit: `g1-minigame-{resultId}`.
  - Oddsen credit: `g1-oddsen-{oddsenStateId}` (different scope — survives across games).
  - All `app_game1_mini_game_results` updates use `WHERE completed_at IS NULL` guard.
- Fail-soft on trigger — orchestrator MUST NOT throw upstream during `maybeTriggerFor`; all errors are logged + audit-event `game1_minigame.trigger_failed`. The draw transaction has already committed at that point.
- Fail-loud on choice — `INVALID_CHOICE` from engine propagates to socket-handler to client.
- Engine `trigger(context)` is pure — no side-effects, no DB writes, no wallet calls. State persistence happens in orchestrator.
- Engine `handleChoice(input)` is server-authoritative — even if client sends `{ spin: true }` for Wheel, server still draws via `crypto.randomInt`.
- Trigger-state in M4 Colordraft + M6 Mystery is reconstructed deterministically from `resultId`-seed (no persistence) — same RNG seed produces same state at trigger AND choice. Resilient to crash-recovery without dedicated state table.
- Oddsen has its OWN state table (`app_game1_oddsen_state`) because resolution is deferred across games — cannot be reconstructed from `resultId` alone.
- All engines support `configSnapshot` from `app_mini_games_config.config_json` — admin can tune prizes without code change.
- Default configs are sane: each engine exports `DEFAULT_*_CONFIG` so missing admin config doesn't crash trigger.

## Test coverage

- `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.test.ts` (1110 LOC) — full lifecycle; trigger → broadcast → choice → payout → audit; idempotency; disconnect-recovery; rotation; type-registry.
- `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.crit5Atomicity.test.ts` (442 LOC) — CRIT-5 atomic transaction (PR #551 K2-B).
- `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.k2a.test.ts` (378 LOC) — K2-A regulatory (gameType + ledger + cap).
- `apps/backend/src/game/minigames/Game1DrawEngineWireUp.test.ts` (138 LOC) — orchestrator wired into draw-engine.
- Per-engine: `MiniGame{Wheel,Chest,Colordraft,Oddsen,Mystery}Engine.test.ts` + `.integration.test.ts` — unit + integration coverage. Total ≈6500 LOC tests.

## Operational notes

Common failures + how to diagnose:
- `MINIGAME_NOT_FOUND` from `handleChoice` — client passed bad resultId. Check `app_game1_mini_game_results` row exists.
- "Mini-game allerede fullført" — client retries after success. Idempotency caught it; benign.
- "Tidslås utløpt" — `completed_at IS NULL` but timestamp says stale. Client took too long; mini-game expires.
- `INVALID_CHOICE` from engine — engine-specific schema validator threw. Check choiceJson shape in client request.
- `ODDSEN_NO_NEXT_GAME` (M5) — player chose during last scheduled-game of the day. Expected; state stays unresolved until cron expires.
- `mini_game:trigger` not received by client — broadcaster wiring; check `setMiniGameOrchestrator` happens AFTER socket setup. NoopBroadcaster swallows silently in tests.
- `MYSTERY_FORCE_DEFAULT_FOR_TESTING` flag (note: this is in `BingoEngineMiniGames.ts`, NOT this framework) — confused engineers may grep for similar in this folder; orchestrator uses `app_mini_games_config.config_json.activeTypes` for rotation, no env-var override.
- House underfunded at credit — `WalletError("INSUFFICIENT_FUNDS")` from `walletAdapter.credit`. Check `house-{hallId}-MAIN_GAME-{channel}` account.
- Audit-event missing — `audit.record` is fire-and-forget; check `app_audit_log` for `game1_minigame.*` rows.

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #592 (`ecb58025`): MED-10 mini-game disconnect-recovery — re-trigger pending on reconnect.
- PR #555 (`d4a7f16a`): note — `MYSTERY_FORCE_DEFAULT_FOR_TESTING` is in `BingoEngineMiniGames`, NOT this framework.
- PR #551 (`f1814893`): K2-B atomicity — `assertNotScheduled` + mini-game TX + master-control rollback.
- PR #550 (`fcb4cb43`): K2-A regulatorisk — `MAIN_GAME` gameType + ledger on mini-game + single-prize-cap.
- PR #430 (`6d832d8f`): port legacy Mystery Game (M6).
- PR #391 (`cb91adb6`): canonical `IdempotencyKeys` module — migrated 28 call-sites.
- PR #368 (`8e58c9d0`): BIN-690 PR-M5 Oddsen-runtime.
- PR #364 (`9f96e569`): BIN-690 PR-M4 Colordraft-runtime.
- PR #355 (`325e046a`): BIN-690 PR-M2 Wheel-runtime.
- PR #351 (`9d432a17`): BIN-690 PR-M1 Mini-game framework.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- Two parallel `MiniGameType` unions exist (one in `BingoEngineMiniGames` for ad-hoc, one in `minigames/types.ts` for scheduled). Long-term, ad-hoc rooms should migrate to this framework so there's only ONE type-system.
- The orchestrator's 1140 LOC mixes (a) lifecycle, (b) DB persistence, (c) broadcaster wiring, (d) disconnect-recovery. Could split into `MiniGameLifecycleService` + `MiniGameStateRepository` + `MiniGameRecoveryWorker`.
- M5 Oddsen has its own state-table + own resolution path — deserves a top-level README in addition to this overview, due to the cross-round complexity.
- Default configs are inlined as constants (`DEFAULT_*_CONFIG`); could be promoted to `app_mini_games_config_defaults` migration data so admin sees them in UI.

