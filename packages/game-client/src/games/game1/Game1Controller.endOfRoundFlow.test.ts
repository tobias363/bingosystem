/**
 * @vitest-environment happy-dom
 *
 * Tobias prod-incident 2026-04-29: end-of-round retail UX. Disse testene
 * speiler overgangs-logikken i Game1Controller (uten å instansiere full
 * Pixi-app, samme harness-pattern som Game1Controller.roundTransition.test.ts
 * og Game1Controller.miniGameQueue.test.ts).
 *
 * Det vi verifiserer:
 *   F1 — onGameEnded(PLAYING) viser end-of-round-overlay (ikke gammel EndScreen)
 *   F2 — onGameEnded(non-PLAYING) → direkte WAITING uten overlay
 *   F3 — onGameStarted lukker overlay før transition (rask auto-round)
 *   F4 — onStateChanged re-rendrer overlay hvis ENDED-state vedvarer (reconnect)
 *   F5 — Klar for neste runde-callback gjør transition uten å auto-arme bonger
 *   F6 — WinScreenV2-aktiv hold-back: end-of-round vises først etter Tilbake
 *   F7 — Pending mini-game forrang: end-of-round vises etter mini-game lukkes
 *   F8 — Late-join til ENDED-runde viser overlay direkte (disconnect-resilience)
 */
import { describe, it, expect, vi } from "vitest";

type Phase = "LOADING" | "WAITING" | "PLAYING" | "SPECTATING" | "ENDED";

interface MiniState {
  gameStatus: "NONE" | "WAITING" | "RUNNING" | "ENDED";
  myTickets: unknown[];
  patternResults?: unknown[];
  drawnNumbers?: number[];
  totalDrawCapacity?: number;
}

interface OverlaySnapshot {
  visible: boolean;
  showCalls: number;
  hideCalls: number;
  lastShowState?: MiniState;
}

class Harness {
  phase: Phase = "PLAYING";
  endScreenTimer: ReturnType<typeof setTimeout> | null = null;
  isWinScreenActive = false;
  shouldShowEndOfRoundOnWinScreenDismiss = false;
  pendingMiniGameTrigger: { id: string } | null = null;
  pendingLegacyMiniGame: { id: string } | null = null;
  overlay: OverlaySnapshot = { visible: false, showCalls: 0, hideCalls: 0 };
  miniGameOnTrigger = vi.fn();
  legacyMiniGameOnActivated = vi.fn();
  transitionTo = vi.fn((phase: Phase, _state: MiniState) => {
    this.phase = phase;
  });
  showEndOfRoundOverlay = vi.fn((state: MiniState) => {
    this.overlay.visible = true;
    this.overlay.showCalls += 1;
    this.overlay.lastShowState = state;
  });
  hideEndOfRoundOverlay = vi.fn(() => {
    if (this.overlay.visible) this.overlay.hideCalls += 1;
    this.overlay.visible = false;
  });

  /** Speil av Game1Controller.onGameEnded (ny overlay-pathing). */
  onGameEnded(state: MiniState): void {
    if (this.phase === "PLAYING") {
      this.transitionTo("ENDED", state);
      if (this.isWinScreenActive) {
        this.shouldShowEndOfRoundOnWinScreenDismiss = true;
      } else {
        this.showEndOfRoundOverlay(state);
      }
    } else {
      this.transitionTo("WAITING", state);
    }
  }

  /** Speil av onGameStarted med overlay-cleanup. */
  onGameStarted(state: MiniState): void {
    if (this.endScreenTimer) {
      clearTimeout(this.endScreenTimer);
      this.endScreenTimer = null;
    }
    this.hideEndOfRoundOverlay();
    this.shouldShowEndOfRoundOnWinScreenDismiss = false;
    if (state.myTickets.length > 0) {
      this.transitionTo("PLAYING", state);
    } else {
      this.transitionTo("SPECTATING", state);
    }
  }

  /** Speil av onStateChanged sin reconnect-resilience. */
  onStateChanged(state: MiniState): void {
    if (this.phase === "ENDED" && state.gameStatus === "RUNNING") {
      if (this.endScreenTimer) {
        clearTimeout(this.endScreenTimer);
        this.endScreenTimer = null;
      }
      this.hideEndOfRoundOverlay();
      if (state.myTickets.length > 0) {
        this.transitionTo("PLAYING", state);
      } else {
        this.transitionTo("SPECTATING", state);
      }
      return;
    }
    if (
      this.phase === "ENDED" &&
      state.gameStatus === "ENDED" &&
      !this.overlay.visible &&
      !this.isWinScreenActive
    ) {
      this.showEndOfRoundOverlay(state);
    }
  }

  /** Speil av flushPendingMiniGameTrigger med overlay-handoff. */
  flushPendingMiniGameTrigger(): void {
    let hasPending = false;
    if (this.pendingMiniGameTrigger) {
      this.miniGameOnTrigger(this.pendingMiniGameTrigger);
      this.pendingMiniGameTrigger = null;
      hasPending = true;
    }
    if (this.pendingLegacyMiniGame) {
      this.legacyMiniGameOnActivated(this.pendingLegacyMiniGame);
      this.pendingLegacyMiniGame = null;
      hasPending = true;
    }
    if (hasPending) return;
    if (this.shouldShowEndOfRoundOnWinScreenDismiss) {
      this.shouldShowEndOfRoundOnWinScreenDismiss = false;
      this.showEndOfRoundOverlay({
        gameStatus: "ENDED",
        myTickets: [],
      });
    }
  }
}

describe("Spill 1 end-of-round overlay flow", () => {
  it("F1: onGameEnded(PLAYING) viser overlay i stedet for gammel EndScreen", () => {
    const h = new Harness();
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.phase).toBe("ENDED");
    expect(h.transitionTo).toHaveBeenCalledWith("ENDED", expect.anything());
    expect(h.overlay.visible).toBe(true);
    expect(h.overlay.showCalls).toBe(1);
  });

  it("F2: onGameEnded når ikke i PLAYING går direkte til WAITING uten overlay", () => {
    const h = new Harness();
    h.phase = "WAITING";
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.phase).toBe("WAITING");
    expect(h.overlay.visible).toBe(false);
    expect(h.overlay.showCalls).toBe(0);
  });

  it("F3: onGameStarted lukker overlay og resetter winscreen-flag", () => {
    const h = new Harness();
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });
    expect(h.overlay.visible).toBe(true);
    h.shouldShowEndOfRoundOnWinScreenDismiss = true;

    h.onGameStarted({ gameStatus: "RUNNING", myTickets: [{ id: "t1" }] });

    expect(h.overlay.visible).toBe(false);
    expect(h.overlay.hideCalls).toBe(1);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(false);
    expect(h.phase).toBe("PLAYING");
  });

  it("F4: onStateChanged re-rendrer overlay hvis ENDED-state men overlay forsvant (reconnect)", () => {
    const h = new Harness();
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });
    expect(h.overlay.visible).toBe(true);

    // Simuler at overlay ble rev ned under reconnect (men phase fortsatt ENDED)
    h.overlay.visible = false;
    h.onStateChanged({ gameStatus: "ENDED", myTickets: [] });

    expect(h.overlay.visible).toBe(true);
    expect(h.overlay.showCalls).toBe(2);
  });

  it("F4 negativt: onStateChanged er no-op når phase ikke er ENDED", () => {
    const h = new Harness();
    h.phase = "WAITING";
    h.onStateChanged({ gameStatus: "ENDED", myTickets: [] });

    expect(h.overlay.visible).toBe(false);
    expect(h.overlay.showCalls).toBe(0);
  });

  it("F4 negativt: onStateChanged er no-op når WinScreenV2 er aktiv", () => {
    const h = new Harness();
    h.phase = "ENDED";
    h.isWinScreenActive = true;
    h.onStateChanged({ gameStatus: "ENDED", myTickets: [] });

    // Skal IKKE re-rendre overlay mens WinScreenV2 (Fullt Hus-fontene) viser
    expect(h.overlay.visible).toBe(false);
    expect(h.overlay.showCalls).toBe(0);
  });

  it("F5: Klar for neste runde dismisser overlay og kaller transition (uten å auto-arme)", () => {
    const h = new Harness();
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });
    expect(h.overlay.visible).toBe(true);

    // Simuler "Klar for neste runde"-klikk: overlay lukkes + transition
    // til WAITING med fresh state. Ingen bonger arm-er — overlay-callback
    // er rent "klar for neste runde", ikke "kjøp og arm".
    h.hideEndOfRoundOverlay();
    h.transitionTo("WAITING", { gameStatus: "WAITING", myTickets: [] });

    expect(h.overlay.visible).toBe(false);
    expect(h.phase).toBe("WAITING");
    expect(h.transitionTo).toHaveBeenLastCalledWith("WAITING", expect.anything());
  });

  it("F6: WinScreenV2 aktiv → onGameEnded utsetter overlay til Tilbake-klikk", () => {
    const h = new Harness();
    h.isWinScreenActive = true;
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    // Phase er satt, men overlay vises IKKE ennå
    expect(h.phase).toBe("ENDED");
    expect(h.overlay.visible).toBe(false);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);

    // WinScreenV2.Tilbake-klikk fyrer onDismiss → flushPendingMiniGameTrigger.
    // Ingen pending mini-game, så overlay vises nå.
    h.isWinScreenActive = false;
    h.flushPendingMiniGameTrigger();

    expect(h.overlay.visible).toBe(true);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(false);
  });

  it("F7: pending M6 mini-game forrang → overlay vises ETTER mini-game", () => {
    const h = new Harness();
    h.isWinScreenActive = true;
    h.pendingMiniGameTrigger = { id: "mg-pending" };
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);
    expect(h.overlay.visible).toBe(false);

    // Tilbake-klikk: mini-game vises FØRST, overlay holdes tilbake
    h.isWinScreenActive = false;
    h.flushPendingMiniGameTrigger();

    expect(h.miniGameOnTrigger).toHaveBeenCalledWith({ id: "mg-pending" });
    // Overlay vises IKKE i samme flush — mini-game-router har overtatt
    expect(h.overlay.visible).toBe(false);

    // Når mini-game lukkes (caller emulert via stateChanged-tick som
    // "skyver" gjennom i Game1Controller), kjører fallback-pathing:
    h.shouldShowEndOfRoundOnWinScreenDismiss = false;
    h.onStateChanged({ gameStatus: "ENDED", myTickets: [] });

    expect(h.overlay.visible).toBe(true);
  });

  it("F7 legacy: pending legacy mini-game forrang", () => {
    const h = new Harness();
    h.isWinScreenActive = true;
    h.pendingLegacyMiniGame = { id: "lg-pending" };
    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    h.isWinScreenActive = false;
    h.flushPendingMiniGameTrigger();

    expect(h.legacyMiniGameOnActivated).toHaveBeenCalledWith({ id: "lg-pending" });
    expect(h.overlay.visible).toBe(false);
  });

  it("F8: late-join til ENDED-runde viser overlay direkte", () => {
    const h = new Harness();
    h.phase = "LOADING";

    // Simuler start()-pathing for ENDED-state late-join
    const state: MiniState = {
      gameStatus: "ENDED",
      myTickets: [],
      patternResults: [],
    };
    h.transitionTo("ENDED", state);
    h.showEndOfRoundOverlay(state);

    expect(h.phase).toBe("ENDED");
    expect(h.overlay.visible).toBe(true);
    expect(h.overlay.lastShowState).toBe(state);
  });
});
