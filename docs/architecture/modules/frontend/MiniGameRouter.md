# MiniGameRouter

**File:** `packages/game-client/src/games/game1/logic/MiniGameRouter.ts` (349 LOC)
**Owner-area:** frontend-runtime
**Last reviewed:** 2026-04-30

## Purpose

Server-authoritative dispatcher for the BIN-690 PR-M6 scheduled-games mini-game protocol. Routes `mini_game:trigger` payloads to the right overlay (wheel / chest / colordraft / oddsen / mystery), wraps the player's choice into `mini_game:choice`, and dispatches `mini_game:result` to the active overlay's `animateResult` hook.

Replaces the legacy `minigame:activated` / `minigame:play` channel for scheduled games (auto-claim Spill 1 still uses the legacy adapter — see `LegacyMiniGameAdapter.ts`). Single-overlay policy: only ONE active mini-game at a time per controller. New trigger → old overlay torn down without animation, new one shown. Fail-closed on choice errors (overlay informed, no dismiss). PIXI-P0-002 (Bølge 2A): graceful drain of in-flight choices on game-end so a player who clicked just before round-end doesn't lose their pick silently.

## Public API

```typescript
export interface MiniGameRouterDeps {
  root: Container                      // Root Container to attach overlay to
  app: GameApp                         // For current screen dimensions
  socket: SpilloramaSocket             // For `sendMiniGameChoice` emits
  bridge: GameBridge                   // For pause-aware overlay countdowns
  onChoiceLost?: (info: ChoiceLostInfo) => void   // PIXI-P0-002 — Game1Controller wires to toast
}

export interface ChoiceLostInfo {
  resultId: string
  reason: "game_ended_before_ack" | "destroy_before_ack"
}

export class MiniGameRouter {
  constructor(deps: MiniGameRouterDeps)

  // Server → Client: mini_game:trigger
  onTrigger(payload: MiniGameTriggerPayload): void

  // Server → Client: mini_game:result
  onResult(payload: MiniGameResultPayload): void

  // Synchronous teardown (called from game-end / destroy)
  dismiss(): void

  // PIXI-P0-002: drain in-flight choices for up to 1500ms before tearing overlay down
  async dismissAfterPendingChoices(timeoutMs?: number): Promise<void>

  // Full destroy
  destroy(): void
}

export const MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS = 1500
```

`MiniGameOverlay` is the union of `WheelOverlay | TreasureChestOverlay | ColorDraftOverlay | OddsenOverlay | MysteryGameOverlay`. Each implements `setOnChoice`, `setOnDismiss`, `show(payload)`, `animateResult(resultJson, payoutCents)`, optional `showChoiceError(err)`.

## Dependencies

**Calls (downstream):**
- `components/WheelOverlay.ts` — Lykkehjul. No choice UI; auto-sends `{}` on player "Snurr"-click.
- `components/TreasureChestOverlay.ts` — Player picks `chosenIndex`. Server reveals all values in result.
- `components/ColorDraftOverlay.ts` — Player matches `targetColor` (shown in trigger).
- `components/OddsenOverlay.ts` — Player picks `chosenNumber`. `payoutCents` is ALWAYS 0 at choice-phase; final outcome arrives in a SECOND `mini_game:result` event after the next game's terskel-draw.
- `components/MysteryGameOverlay.ts` — Mystery — port of legacy 10-bucket spinning wheel.
- `bridge/GameBridge.ts` — passed to pause-aware overlays (Wheel, TreasureChest) so countdowns respect `state.isPaused`.
- `net/SpilloramaSocket.ts` — `socket.sendMiniGameChoice({ resultId, choiceJson })` returns ack `{ ok, error? }`.
- `telemetry/Telemetry.ts` — `minigame_triggered`, `minigame_choice_sent`, `minigame_choice_failed`, `minigame_choice_lost`, `minigame_resolved`.

**Called by (upstream):**
- `games/game1/Game1Controller.ts:202` — single instance constructed in controller `start()`. `bridge.on("miniGameTrigger", data => router.onTrigger(data))`, `bridge.on("miniGameResult", data => router.onResult(data))`. `controller.onGameEnded` calls `router.dismissAfterPendingChoices()`. Controller's `destroy` calls `router.destroy()`.
- `MiniGameRouter.test.ts` — direct unit tests of trigger / choice / result lifecycle.

## Invariants

- **Single overlay at a time.** New trigger destroys old overlay first (no animation) — server-authoritative override invariant. `activeResultId` updated atomically with `overlay` field.
- **Stale-result guard.** `onResult` ignores payloads where `payload.resultId !== activeResultId` — protects against late events from a prior round buffered in the socket.
- **Fail-closed on choice error.** `sendChoice` `await`s the socket ack; on `ack.ok === false`, calls `overlay.showChoiceError({ code, message })` and DOES NOT dismiss. Player can retry; server ignores duplicates via `completed_at` lock in `Game1MiniGameOrchestrator`.
- **In-flight choice tracking.** `inFlightChoices: Set<string>` — `sendChoice` adds the resultId before the socket call, removes in `finally`. `dismissAfterPendingChoices` polls this set on a 25ms interval until empty or timeout.
- **PIXI-P0-002 graceful drain.** On game-end, controller calls `dismissAfterPendingChoices(1500ms)`. If choices remain in flight after timeout, fires `onChoiceLost({ resultId, reason: "game_ended_before_ack" })` for each and emits `minigame_choice_lost` telemetry. Backend remains idempotent so a late-arriving ack still credits the payout — the user-visible loss window is purely client-side.
- **Exhaustive miniGameType switch.** TypeScript enforces with `_exhaustive: never` — adding a new type forces compile-time wiring. Unknown types at runtime are logged and skipped (protocol violation).
- **Overlays receive `setOnChoice` + `setOnDismiss` once at construction.** Router wires the dispatch logic; overlays don't see the resultId or socket directly — they emit `choiceJson` and the router adds metadata.
- **Inflight-set cleared on `destroy`.** `destroy()` calls `dismiss()` then `inFlightChoices.clear()` — no leftover state for the next router instance.

## Test coverage

- `packages/game-client/src/games/game1/logic/MiniGameRouter.test.ts` — covers:
  - `onTrigger` instantiation per `miniGameType`, attaches to root, calls `show(payload)`.
  - Stale `onResult` (mismatching resultId) dropped silently.
  - `sendChoice` happy path with ack.ok=true; resultId added to inFlightChoices, removed in finally.
  - `sendChoice` failure: `overlay.showChoiceError(err)` called, overlay NOT dismissed.
  - `dismissAfterPendingChoices` waits for in-flight then dismisses; on timeout, fires `onChoiceLost`.
  - `MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS` exported for the test.
- Indirect coverage in `Game1Controller.miniGameQueue.test.ts` for queueing semantics while WinScreenV2 is active.

## Operational notes

- **"Mini-game choice ble ikke registrert i tide" toast appears too often:** server-side mini-game orchestrator is slow to ack `mini_game:choice`. Check `Game1MiniGameOrchestrator` latency. The 1500ms drain timeout in PIXI-P0-002 covers slow mobile networks; if it's still timing out, the dependency is unhealthy.
- **Overlay never shows on trigger:** `payload.miniGameType` is unknown. Console will show "[MiniGameRouter] Unknown miniGameType, ignoring trigger" — protocol mismatch with server. Verify shared-types version aligns.
- **Result event arrives but no animation:** `activeResultId` is null (overlay dismissed, e.g. by manual close before result lands) OR `payload.resultId !== activeResultId` (stale event). Console will show debug log "[MiniGameRouter] result ignored — no active overlay or resultId mismatch".
- **Oddsen final outcome confusion:** `payoutCents` from the choice-phase result is 0 by design. The final outcome arrives later as a SECOND `mini_game:result` event. UI shows "Valg registrert" until then.
- **Concurrent triggers (rare):** if server emits two triggers in rapid succession, the first overlay is destroyed without animation. This is intentional but visually abrupt — server should sequence triggers per player.

## Recent significant changes

- PR #702 (`275fa2be`) — Bølge 2A PIXI-P0-002: `dismissAfterPendingChoices` graceful drain, `onChoiceLost` callback, `MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS = 1500ms`.
- PR #475 (`1e56ed0c`) — Mystery wired into shared-types + router + admin-UI (mystery added to overlay union).
- PR #374 (`e73aa7cb`) — BIN-690 PR-M6 mini-game-klient M1-kontrakt + Oddsen-overlay (initial M6 protocol).
- PR #310 (`efbc99a6`) — hygiene: dead code removal (`showMiniGameBonus` removed from controller).
- PR #308 (`e6a8cc18`) — Fase 3: extracted `MiniGameRouter` from monolith Game1Controller.

## Refactor status

Stable. The router is the canonical M6 dispatcher; `LegacyMiniGameAdapter` exists alongside for the auto-claim Spill 1 path that still uses the legacy `minigame:activated` channel (PR #728). When auto-claim migrates to M6 (separate Linear ticket), the legacy adapter can be removed.

See `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md` for the overlay-coexistence rules.
