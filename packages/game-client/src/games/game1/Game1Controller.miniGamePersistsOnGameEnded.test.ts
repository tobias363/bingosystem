/**
 * @vitest-environment happy-dom
 *
 * REGRESSION 2026-04-29 demo-blocker — mini-game MUST persist after game-end.
 *
 * Tobias rapporterte 2026-04-29 at i Spill 1 Demo Hall: spilleren vant Fullt
 * Hus + Mystery Joker mini-game ble aktivert, men når MAX_DRAWS_REACHED kom
 * 10 sek senere ble runden avsluttet og mini-game-overlay revet ned før
 * spilleren rakk å fullføre. Bug-en kommer fra `Game1Controller.onGameEnded`
 * som blindt dismisset mini-game-overlay for å unngå å blokkere EndScreen.
 *
 * Fix: sjekk om mini-game er aktiv (via `isActive()` på router/adapter)
 * eller står i kø (`pendingMiniGameTrigger`/`pendingLegacyMiniGame`).
 * Hvis så, hopp over dismiss i `onGameEnded` og hold tilbake end-of-round-
 * overlay til mini-game-overlay selv signaliserer at den er ferdig
 * (via setOnAfterDismiss-hook).
 *
 * Speiler `onGameEnded` + `onMiniGameDismissed`-overgangen i Game1Controller
 * uten å boote full controller — samme harness-pattern som
 * Game1Controller.endOfRoundFlow.test.ts.
 */
import { describe, it, expect, vi } from "vitest";

interface MiniState {
  gameStatus: "NONE" | "WAITING" | "RUNNING" | "ENDED";
  myTickets: unknown[];
  patternResults?: unknown[];
}

interface MiniGameStub {
  active: boolean;
  dismissCalls: number;
  dismiss: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
}

class Harness {
  phase: "PLAYING" | "ENDED" | "WAITING" | "SPECTATING" | "LOADING" = "PLAYING";
  isWinScreenActive = false;
  shouldShowEndOfRoundOnWinScreenDismiss = false;
  pendingMiniGameTrigger: { id: string } | null = null;
  pendingLegacyMiniGame: { id: string } | null = null;
  miniGame: MiniGameStub;
  legacyMiniGame: MiniGameStub;
  endOfRoundOverlayShown = 0;
  miniGameDismissedCalls = 0;
  transitionTo = vi.fn();

  constructor() {
    this.miniGame = this.makeMiniGameStub();
    this.legacyMiniGame = this.makeMiniGameStub();
  }

  private makeMiniGameStub(): MiniGameStub {
    const stub = {
      active: false,
      dismissCalls: 0,
      dismiss: vi.fn(() => {
        stub.active = false;
        stub.dismissCalls += 1;
      }),
      isActive: vi.fn(() => stub.active),
    };
    return stub;
  }

  showEndOfRoundOverlay(_state: MiniState): void {
    this.endOfRoundOverlayShown += 1;
  }

  /**
   * Speil av Game1Controller.onGameEnded — kun dismiss-decision-pathen.
   * Demo-blocker-fix 2026-04-29: hopp over dismiss hvis mini-game er aktiv.
   */
  onGameEnded(state: MiniState): void {
    const miniGameActive =
      this.miniGame.isActive() === true ||
      this.legacyMiniGame.isActive() === true ||
      this.pendingMiniGameTrigger !== null ||
      this.pendingLegacyMiniGame !== null;

    if (!miniGameActive) {
      this.miniGame.dismiss();
      this.legacyMiniGame.dismiss();
      this.pendingLegacyMiniGame = null;
    }

    if (this.phase === "PLAYING") {
      this.phase = "ENDED";
      this.transitionTo("ENDED", state);
      if (this.isWinScreenActive) {
        this.shouldShowEndOfRoundOnWinScreenDismiss = true;
      } else if (miniGameActive) {
        // Mini-game vises eller står i kø — utsett end-of-round.
        this.shouldShowEndOfRoundOnWinScreenDismiss = true;
      } else {
        this.showEndOfRoundOverlay(state);
      }
    }
  }

  /** Speil av onMiniGameDismissed-hook. */
  onMiniGameDismissed(): void {
    this.miniGameDismissedCalls += 1;
    if (!this.shouldShowEndOfRoundOnWinScreenDismiss) return;
    if (this.isWinScreenActive) return;
    this.shouldShowEndOfRoundOnWinScreenDismiss = false;
    if (this.phase === "ENDED") {
      this.showEndOfRoundOverlay({ gameStatus: "ENDED", myTickets: [] });
    }
  }

  /** Simulér mini-game aktivering. */
  activateMiniGame(): void {
    this.miniGame.active = true;
  }

  /** Simulér legacy mini-game aktivering. */
  activateLegacyMiniGame(): void {
    this.legacyMiniGame.active = true;
  }

  /** Simulér at mini-game-overlay finished (player choice + animation). */
  finishMiniGame(legacy = false): void {
    if (legacy) {
      this.legacyMiniGame.active = false;
    } else {
      this.miniGame.active = false;
    }
    // Adapter/router calls onAfterDismiss when overlay is destroyed.
    this.onMiniGameDismissed();
  }
}

describe("Game1Controller — mini-game persistence on game-ended (demo-blocker 2026-04-29)", () => {
  it("Aktiv mini-game ved game-end → IKKE dismiss + utsett end-of-round-overlay", () => {
    const h = new Harness();
    h.activateMiniGame();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.miniGame.dismissCalls).toBe(0);
    expect(h.legacyMiniGame.dismissCalls).toBe(0);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);
    expect(h.miniGame.isActive()).toBe(true);
  });

  it("Aktiv legacy mini-game ved game-end → IKKE dismiss + utsett end-of-round", () => {
    const h = new Harness();
    h.activateLegacyMiniGame();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.legacyMiniGame.dismissCalls).toBe(0);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);
  });

  it("Pending mini-game-trigger ved game-end → IKKE dismiss + utsett", () => {
    const h = new Harness();
    h.pendingMiniGameTrigger = { id: "pending-mg" };

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.miniGame.dismissCalls).toBe(0);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);
  });

  it("Pending legacy mini-game ved game-end → IKKE dismiss + utsett", () => {
    const h = new Harness();
    h.pendingLegacyMiniGame = { id: "pending-legacy" };

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.legacyMiniGame.dismissCalls).toBe(0);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);
  });

  it("INGEN mini-game ved game-end → dismiss + vis end-of-round-overlay umiddelbart", () => {
    const h = new Harness();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.miniGame.dismissCalls).toBe(1);
    expect(h.legacyMiniGame.dismissCalls).toBe(1);
    expect(h.endOfRoundOverlayShown).toBe(1);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(false);
  });

  it("Mini-game finishes → end-of-round-overlay vises ETTERPÅ (ikke før)", () => {
    const h = new Harness();
    h.activateMiniGame();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });
    expect(h.endOfRoundOverlayShown).toBe(0);

    // Bruker fullfører mini-game → overlay dismisses → onAfterDismiss
    // fyrer → controller viser end-of-round-overlay.
    h.finishMiniGame(false);

    expect(h.miniGameDismissedCalls).toBe(1);
    expect(h.endOfRoundOverlayShown).toBe(1);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(false);
  });

  it("Legacy mini-game finishes → end-of-round-overlay vises ETTERPÅ", () => {
    const h = new Harness();
    h.activateLegacyMiniGame();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });
    expect(h.endOfRoundOverlayShown).toBe(0);

    h.finishMiniGame(true);

    expect(h.endOfRoundOverlayShown).toBe(1);
  });

  it("WinScreenV2 aktiv samtidig som mini-game → utsett end-of-round (begge guards aktive)", () => {
    const h = new Harness();
    h.isWinScreenActive = true;
    h.activateMiniGame();

    h.onGameEnded({ gameStatus: "ENDED", myTickets: [] });

    expect(h.miniGame.dismissCalls).toBe(0);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);

    // Mini-game kan ikke triggere end-of-round mens WinScreenV2 er oppe.
    h.finishMiniGame(false);
    expect(h.endOfRoundOverlayShown).toBe(0);
    expect(h.shouldShowEndOfRoundOnWinScreenDismiss).toBe(true);

    // WinScreenV2 lukker → end-of-round flushes.
    h.isWinScreenActive = false;
    h.shouldShowEndOfRoundOnWinScreenDismiss = false; // simulert flush
    h.showEndOfRoundOverlay({ gameStatus: "ENDED", myTickets: [] });

    expect(h.endOfRoundOverlayShown).toBe(1);
  });

  it("onMiniGameDismissed når shouldShowEndOfRoundOnWinScreenDismiss=false → ingen overlay (ingen game-end pending)", () => {
    const h = new Harness();
    // Mid-round mini-game som dismisses naturlig — ingen game-end pending.
    h.activateMiniGame();
    h.finishMiniGame(false);

    expect(h.miniGameDismissedCalls).toBe(1);
    expect(h.endOfRoundOverlayShown).toBe(0);
  });
});
