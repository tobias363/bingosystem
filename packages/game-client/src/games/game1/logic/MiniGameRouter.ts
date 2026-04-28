import { Container } from "pixi.js";
import type { GameBridge } from "../../../bridge/GameBridge.js";
import type { SpilloramaSocket } from "../../../net/SpilloramaSocket.js";
import type { GameApp } from "../../../core/GameApp.js";
import type {
  MiniGameTriggerPayload,
  MiniGameResultPayload,
} from "@spillorama/shared-types/socket-events";
import { telemetry } from "../../../telemetry/Telemetry.js";
import { WheelOverlay } from "../components/WheelOverlay.js";
import { TreasureChestOverlay } from "../components/TreasureChestOverlay.js";
import { ColorDraftOverlay } from "../components/ColorDraftOverlay.js";
import { OddsenOverlay } from "../components/OddsenOverlay.js";
import { MysteryGameOverlay } from "../components/MysteryGameOverlay.js";

/**
 * BIN-690 PR-M6: MiniGameRouter for the scheduled-games framework.
 *
 * Replaces the legacy `minigame:activated`/`minigame:play` path. The new
 * protocol is a 3-step server-authoritative flow:
 *
 *   1. Server → Client: `mini_game:trigger { resultId, miniGameType, payload }`
 *      - Router picks the overlay for `miniGameType` and calls `show(payload)`.
 *   2. Client → Server: `mini_game:choice { resultId, choiceJson }`
 *      - Overlays fire via `setOnChoice` when the player picks. Router wraps
 *        the dispatch, adds `resultId`, and emits via SpilloramaSocket.
 *   3. Server → Client: `mini_game:result { resultId, miniGameType, payoutCents, resultJson }`
 *      - Router dispatches to the overlay's `animateResult(resultJson, payoutCents)`
 *        method. Overlay handles visuals + auto-dismiss timing.
 *
 * Per-type semantics:
 *   - wheel: no choice UI. Auto-sends `{}` when player clicks "Snurr".
 *     payoutCents > 0 for win, 0 if all buckets are 0-amount.
 *   - chest: player picks `chosenIndex`. Server reveals all values in result.
 *   - colordraft: player matches `targetColor` (shown in trigger).
 *   - oddsen: player picks `chosenNumber`. payoutCents is ALWAYS 0 at choice-
 *     phase — Oddsen resolves in the NEXT game's terskel-draw via a second
 *     `mini_game:result` event. Overlay shows "Valg registrert" state after
 *     choice; final outcome arrives later.
 *
 * Single-overlay policy: only ONE active overlay at a time. A new trigger
 * while an overlay is showing is treated as a server-authoritative override —
 * the old one is dismissed (no animation) and the new one replaces it.
 *
 * Fail-closed on choice: if socket emit returns an error ack, the overlay is
 * informed via `showChoiceError(message)` and does NOT dismiss. The player
 * can retry; the server ignores dupes via `completed_at` lock (orchestrator).
 *
 * Never shows hidden data: overlays render only what arrives in trigger's
 * payload. Chest values stay hidden until result-event arrives.
 */

type MiniGameOverlay =
  | WheelOverlay
  | TreasureChestOverlay
  | ColorDraftOverlay
  | OddsenOverlay
  | MysteryGameOverlay;

/**
 * Error shape passed to overlays when a socket emit fails. Keeps the overlay
 * contract minimal: they need a message to display and a signal not to
 * dismiss.
 */
export interface ChoiceError {
  readonly code: string;
  readonly message: string;
}

interface MiniGameRouterDeps {
  /** Root container to attach the active overlay to. */
  readonly root: Container;
  /** Host app — used for current screen dimensions. */
  readonly app: GameApp;
  /** Socket wrapper — used for `sendMiniGameChoice` emits. */
  readonly socket: SpilloramaSocket;
  /**
   * Bridge — passed to pause-aware overlays (Wheel / TreasureChest) so their
   * countdowns respect `state.isPaused`.
   */
  readonly bridge: GameBridge;
  /**
   * PIXI-P0-002 (Bølge 2A, 2026-04-28): user-visible callback for when a
   * mini-game choice could not be persisted before forced dismissal (game
   * ended while choice was in-flight). Optional — if omitted the router
   * still emits telemetry + console.warn but the player sees nothing.
   * Wired by `Game1Controller` to a toast.
   */
  readonly onChoiceLost?: (info: ChoiceLostInfo) => void;
}

/**
 * PIXI-P0-002: surface info passed to `onChoiceLost`. Reason explains the
 * failure mode so different mini-games / future call sites can render
 * tailored copy if needed.
 */
export interface ChoiceLostInfo {
  readonly resultId: string;
  readonly reason: "game_ended_before_ack" | "destroy_before_ack";
}

/**
 * PIXI-P0-002: how long `dismissAfterPendingChoices` waits for an in-flight
 * `mini_game:choice` ack before forcibly destroying the overlay. Server
 * round-trip is typically <100ms; 1500ms covers slow mobile networks while
 * staying short enough that the player doesn't see EndScreen blocked. The
 * value is exported for the test.
 */
export const MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS = 1500;

export class MiniGameRouter {
  private overlay: MiniGameOverlay | null = null;
  /**
   * ResultId from the most recent trigger. Used to validate that incoming
   * `mini_game:result` events match the active overlay; stale results
   * (from a prior game) are silently ignored so we don't mis-animate.
   */
  private activeResultId: string | null = null;
  /**
   * PIXI-P0-002 (Bølge 2A, 2026-04-28): set of resultIds for choices we've
   * emitted but not yet received an ack for. Lets `dismissAfterPendingChoices`
   * (called from `Game1Controller.onGameEnded`) wait briefly before tearing
   * the overlay down — preventing the silent "I picked but nothing happened"
   * loss that the audit flagged.
   */
  private inFlightChoices = new Set<string>();

  constructor(private readonly deps: MiniGameRouterDeps) {}

  /**
   * Server → Client: handle `mini_game:trigger`. Instantiates the overlay for
   * `miniGameType`, wires callbacks, and displays it. If an overlay is
   * already active it's destroyed (no animation) before the new one shows —
   * this matches the server-authoritative invariant that only one mini-game
   * exists per player at a time.
   */
  onTrigger(payload: MiniGameTriggerPayload): void {
    const w = this.deps.app.app.screen.width;
    const h = this.deps.app.app.screen.height;

    // Dismiss any active overlay first — server-authoritative override.
    if (this.overlay) {
      this.dismiss();
    }

    const overlay: MiniGameOverlay = (() => {
      switch (payload.miniGameType) {
        case "wheel":
          return new WheelOverlay(w, h, this.deps.bridge);
        case "chest":
          return new TreasureChestOverlay(w, h, this.deps.bridge);
        case "colordraft":
          return new ColorDraftOverlay(w, h);
        case "oddsen":
          return new OddsenOverlay(w, h);
        case "mystery":
          return new MysteryGameOverlay(w, h);
        default: {
          // Exhaustive-check: if a new type is added to the union the compiler
          // will flag this default. At runtime, unknown types are a protocol
          // violation — log and skip.
          const _exhaustive: never = payload.miniGameType;
          void _exhaustive;
          console.warn(
            "[MiniGameRouter] Unknown miniGameType, ignoring trigger:",
            payload.miniGameType,
          );
          return null as unknown as MiniGameOverlay;
        }
      }
    })();

    if (!overlay) return;

    overlay.setOnChoice((choiceJson) => this.sendChoice(choiceJson));
    overlay.setOnDismiss(() => this.dismiss());
    this.overlay = overlay;
    this.activeResultId = payload.resultId;
    this.deps.root.addChild(overlay);
    overlay.show(payload.payload);

    telemetry.trackEvent("minigame_triggered", {
      type: payload.miniGameType,
      resultId: payload.resultId,
    });
  }

  /**
   * Server → Client: handle `mini_game:result`. Dispatches to the active
   * overlay's `animateResult` hook. Mismatching `resultId` is treated as a
   * stale event (e.g. from a previous game left over in the socket buffer)
   * and dropped silently.
   */
  onResult(payload: MiniGameResultPayload): void {
    if (!this.overlay || this.activeResultId !== payload.resultId) {
      console.debug(
        "[MiniGameRouter] result ignored — no active overlay or resultId mismatch",
        { activeResultId: this.activeResultId, incoming: payload.resultId },
      );
      return;
    }
    this.overlay.animateResult(payload.resultJson, payload.payoutCents);
    telemetry.trackEvent("minigame_resolved", {
      type: payload.miniGameType,
      payoutCents: payload.payoutCents,
      resultId: payload.resultId,
    });
  }

  /**
   * Client → Server: send the player's choice. Wraps it in the full
   * `mini_game:choice` payload with the active `resultId`. On error, informs
   * the overlay so it can show feedback WITHOUT dismissing (fail-closed).
   *
   * PIXI-P0-002 (Bølge 2A): tracks the in-flight resultId in
   * `this.inFlightChoices` so `dismissAfterPendingChoices` can wait for the
   * ack before tearing the overlay down on game-end.
   */
  private async sendChoice(
    choiceJson: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.activeResultId) {
      console.warn("[MiniGameRouter] sendChoice called with no active resultId");
      return;
    }
    const resultId = this.activeResultId;
    this.inFlightChoices.add(resultId);
    try {
      const ack = await this.deps.socket.sendMiniGameChoice({
        resultId,
        choiceJson,
      });
      if (!ack.ok) {
        const err: ChoiceError = {
          code: ack.error?.code ?? "UNKNOWN",
          message: ack.error?.message ?? "Ukjent feil ved innsending av valg.",
        };
        console.error("[MiniGameRouter] mini_game:choice failed:", err);
        this.overlay?.showChoiceError?.(err);
        telemetry.trackEvent("minigame_choice_failed", {
          code: err.code,
          resultId,
        });
        return;
      }
      telemetry.trackEvent("minigame_choice_sent", { resultId });
    } finally {
      this.inFlightChoices.delete(resultId);
    }
  }

  /**
   * PIXI-P0-002 (Bølge 2A, 2026-04-28): graceful version of `dismiss` for
   * use by `Game1Controller.onGameEnded`. If the player has clicked but the
   * `mini_game:choice` ack hasn't returned yet, we wait up to
   * `MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS` for it to land before tearing down
   * the overlay. If the timeout fires first the choice is reported as lost
   * (telemetry + `onChoiceLost` callback so the controller can toast).
   *
   * Backend is idempotent on `mini_game:choice` (orchestrator's
   * `completed_at` lock — see `Game1MiniGameOrchestrator`), so even if the
   * ack arrives after we forcibly dismiss, the server still credits the
   * payout. The user-visible problem is purely client-side: they made a
   * choice and saw no feedback. This method shrinks the loss window to
   * effectively zero on a healthy connection.
   */
  async dismissAfterPendingChoices(
    timeoutMs: number = MINI_GAME_CHOICE_DRAIN_TIMEOUT_MS,
  ): Promise<void> {
    // No overlay → nothing to drain.
    if (!this.overlay) return;
    // No in-flight choice → behave exactly like dismiss().
    if (this.inFlightChoices.size === 0) {
      this.dismiss();
      return;
    }

    const pendingResultIds = Array.from(this.inFlightChoices);

    // Poll the in-flight set on a microtask cadence until empty or timeout.
    // The set is mutated by `sendChoice`'s finally-block, so we just wait
    // for it to drain. Using setTimeout (not setInterval) avoids leaking
    // a timer if `dismiss()` is called externally mid-drain.
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = (): void => {
        if (this.inFlightChoices.size === 0) {
          resolve();
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 25);
      };
      tick();
    });

    // Anything still in the set after the wait → the choice was lost.
    if (this.inFlightChoices.size > 0) {
      for (const resultId of pendingResultIds) {
        if (!this.inFlightChoices.has(resultId)) continue;
        console.warn(
          "[MiniGameRouter] mini-game choice lost (game ended before ack)",
          { resultId, timeoutMs },
        );
        telemetry.trackEvent("minigame_choice_lost", {
          resultId,
          reason: "game_ended_before_ack",
          timeoutMs,
        });
        try {
          this.deps.onChoiceLost?.({
            resultId,
            reason: "game_ended_before_ack",
          });
        } catch (err) {
          console.error("[MiniGameRouter] onChoiceLost callback threw", err);
        }
      }
    }

    // Drain or timeout reached — destroy the overlay either way. Server
    // remains authoritative + idempotent (orchestrator completed_at lock),
    // so a late-arriving ack doesn't double-pay.
    this.dismiss();
  }

  /**
   * Destroy the active overlay and clear router state. Called by overlays
   * after their dismiss-animation and by Game1Controller on game-ended to
   * ensure overlays don't block the EndScreen.
   *
   * NOTE: This is the synchronous tear-down. For game-end use
   * `dismissAfterPendingChoices` instead — it briefly waits for in-flight
   * `mini_game:choice` acks so the player doesn't lose their pick.
   */
  dismiss(): void {
    this.overlay?.destroy({ children: true });
    this.overlay = null;
    this.activeResultId = null;
  }

  destroy(): void {
    this.dismiss();
    this.inFlightChoices.clear();
  }
}
