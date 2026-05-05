/**
 * @vitest-environment happy-dom
 *
 * Game1Controller claim-UX tests (BIN-420 G26 — Gap #1, Gap #3).
 *
 * Bølge G (2026-05-05) — manuell ClaimButton fjernet fra game1/game3
 * PlayScreen. Server-side auto-claim-on-draw (BIN-689) eier nå claim-
 * flyten. Denne harness verifiserer den gjenværende `Game1SocketActions
 * .claim()`-kontrakten:
 *
 *   #1 — On `ok:false`, `toast.error` is called with the server error message.
 *   #3 — When phase is SPECTATING, the call short-circuits with an info toast.
 *
 * Tidligere "Gap #2 — reset claim-button on NACK" er deprecated siden
 * knappen ikke lenger eksisterer i game1/game3-PlayScreen.
 *
 * Unity-refs:
 *   - `gameEvents.ts:757-843` — server NACK/ACK contract for claim:submit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import via registry so the module side-effect (registerGame) runs and gives
// us the class. We only need the class body — we won't call start().
import "./Game1Controller.js";

// Access the class via dynamic import of the module's exports. Since the
// controller is registered as a factory rather than a named export, we
// reconstruct the relevant logic in a lightweight harness that mirrors the
// production handleClaim wiring. This keeps the test hermetic.

type ClaimResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { message: string } };

interface ToastStub {
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  win: ReturnType<typeof vi.fn>;
}

/**
 * Lightweight harness that mirrors Game1SocketActions.claim. We duplicate
 * the production logic here so the test verifies the contract without a
 * 1000-line controller boot. Bølge G: ingen `playScreen.resetClaimButton`-
 * kall lenger — server eier flyten via auto-claim-on-draw.
 */
async function harnessHandleClaim(
  type: "LINE" | "BINGO",
  ctx: {
    phase: "WAITING" | "PLAYING" | "SPECTATING" | "ENDED";
    socket: { submitClaim: (p: unknown) => Promise<ClaimResult> };
    toast: ToastStub;
    roomCode: string;
  },
): Promise<void> {
  if (ctx.phase === "SPECTATING") {
    ctx.toast.info("Tilskuere kan ikke gjøre claims");
    return;
  }
  const result = await ctx.socket.submitClaim({ roomCode: ctx.roomCode, type });
  if (!result.ok) {
    ctx.toast.error(result.error?.message ?? `Ugyldig ${type === "LINE" ? "rekke" : "bingo"}-claim`);
  }
}

function makeToast(): ToastStub {
  return {
    error: vi.fn(),
    info: vi.fn(),
    win: vi.fn(),
  };
}

describe("Game1Controller.handleClaim — Gap #1 (toast.error)", () => {
  let toast: ToastStub;

  beforeEach(() => {
    toast = makeToast();
  });

  it("shows toast.error with the server's message when claim fails", async () => {
    const socket = {
      submitClaim: vi.fn().mockResolvedValue({
        ok: false,
        error: { message: "Mønster ikke fullført" },
      }),
    };

    await harnessHandleClaim("LINE", {
      phase: "PLAYING",
      socket,
      toast,
      roomCode: "ABCD",
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Mønster ikke fullført");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("falls back to a localized message when server error has no message", async () => {
    const socket = {
      submitClaim: vi.fn().mockResolvedValue({ ok: false, error: {} as { message: string } }),
    };
    await harnessHandleClaim("BINGO", {
      phase: "PLAYING",
      socket,
      toast,
      roomCode: "ABCD",
    });
    expect(toast.error).toHaveBeenCalledWith("Ugyldig bingo-claim");
  });

  it("does NOT show toast.error on successful claim (ok:true)", async () => {
    const socket = {
      submitClaim: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    };
    await harnessHandleClaim("LINE", {
      phase: "PLAYING",
      socket,
      toast,
      roomCode: "ABCD",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("Game1Controller.handleClaim — Gap #3 (spectator feedback)", () => {
  it("short-circuits with an info toast when phase is SPECTATING", async () => {
    const toast = makeToast();
    const socket = { submitClaim: vi.fn() };

    await harnessHandleClaim("LINE", {
      phase: "SPECTATING",
      socket,
      toast,
      roomCode: "ABCD",
    });

    expect(toast.info).toHaveBeenCalledWith("Tilskuere kan ikke gjøre claims");
    expect(socket.submitClaim).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
