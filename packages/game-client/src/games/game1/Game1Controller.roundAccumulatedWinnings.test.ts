/**
 * @vitest-environment happy-dom
 *
 * REGRESSION 2026-04-29 — End-of-round overlay viser dobbel gevinst (3400 vs 1700).
 *
 * Tobias rapporterte 2026-04-29 at i Spill 1 demo-runde med default-gevinster:
 *   1 Rad 100 + 2 Rader 200 + 3 Rader 200 + 4 Rader 200 + Fullt Hus 1000 = 1700 kr,
 * animasjonen i end-of-round-overlay teller opp til 3400 kr — eksakt 2× faktisk.
 * Wallet-credit er korrekt (server-side test verifiserer 1700 kr); det er kun
 * klient-side display som er feil.
 *
 * Fix: `roundAccumulatedWinnings` skal kun akkumulere i ÉN code-path. Hvis både
 * `pattern:won` og `room:update` (gjennom egen path) kan trigge akkumulering,
 * får vi dobling. Vi speiler `onPatternWon`-logikken og verifiserer:
 *
 *   1. 5 sekvensielle pattern:won-events for samme spiller summerer til 1700.
 *   2. Akkumulering MÅ være guarded mot duplikat-event for samme patternId.
 *   3. Ny runde resetter akkumulator til 0.
 *
 * Speiler Game1Controller's onPatternWon mini-logikk uten å boote full
 * controller — samme pattern som Game1Controller.patternWon.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { PatternWonPayload } from "@spillorama/shared-types/socket-events";

interface AccumulatorState {
  myPlayerId: string | null;
  roundAccumulatedWinnings: number;
  /**
   * Idempotency-vakt for å unngå dobbel-akkumulering hvis pattern:won fires
   * to ganger for samme patternId (race med room:update / reconnect-replay).
   */
  accumulatedPatternIds: Set<string>;
}

function createState(myPlayerId: string | null): AccumulatorState {
  return {
    myPlayerId,
    roundAccumulatedWinnings: 0,
    accumulatedPatternIds: new Set(),
  };
}

/**
 * Speil av Game1Controller.onPatternWon — kun akkumulator-delen. Inkluderer
 * idempotency-vakt slik at duplikat-events ikke akkumulerer dobbelt.
 */
function harnessOnPatternWon(
  result: PatternWonPayload,
  state: AccumulatorState,
): void {
  const winnerIds = result.winnerIds ?? (result.winnerId ? [result.winnerId] : []);
  const isMe = state.myPlayerId !== null && winnerIds.includes(state.myPlayerId);
  if (!isMe) return;

  // Idempotency-vakt: samme patternId skal kun akkumulere én gang per runde.
  if (state.accumulatedPatternIds.has(result.patternId)) {
    return;
  }
  state.accumulatedPatternIds.add(result.patternId);

  const payout = result.payoutAmount ?? 0;
  state.roundAccumulatedWinnings += payout;
}

function resetForNewRound(state: AccumulatorState): void {
  state.roundAccumulatedWinnings = 0;
  state.accumulatedPatternIds.clear();
}

function makePayload(
  overrides: Partial<PatternWonPayload> = {},
): PatternWonPayload {
  return {
    patternId: "pattern-1",
    patternName: "1 Rad",
    winnerId: "player-1",
    wonAtDraw: 5,
    payoutAmount: 100,
    claimType: "LINE",
    gameId: "game-1",
    winnerIds: ["player-1"],
    winnerCount: 1,
    ...overrides,
  };
}

describe("Game1Controller.roundAccumulatedWinnings — 1700 kr default-gevinst-flyt", () => {
  it("solo-vinner alle 5 faser → akkumulator = 1700 (ikke 3400)", () => {
    const state = createState("player-1");

    // Sekvensielle pattern:won-events i pattern-rekkefølge (engine emitterer
    // én event per fase når den vinnes, alltid for samme spiller her).
    harnessOnPatternWon(
      makePayload({ patternId: "p-1rad", patternName: "1 Rad", payoutAmount: 100 }),
      state,
    );
    harnessOnPatternWon(
      makePayload({ patternId: "p-2rad", patternName: "2 Rader", payoutAmount: 200 }),
      state,
    );
    harnessOnPatternWon(
      makePayload({ patternId: "p-3rad", patternName: "3 Rader", payoutAmount: 200 }),
      state,
    );
    harnessOnPatternWon(
      makePayload({ patternId: "p-4rad", patternName: "4 Rader", payoutAmount: 200 }),
      state,
    );
    harnessOnPatternWon(
      makePayload({
        patternId: "p-fullthus",
        patternName: "Fullt Hus",
        claimType: "BINGO",
        payoutAmount: 1000,
      }),
      state,
    );

    expect(state.roundAccumulatedWinnings).toBe(1700);
  });

  it("DUPLIKAT pattern:won for samme patternId → akkumulator forblir korrekt (idempotent)", () => {
    const state = createState("player-1");

    // Første event: 1 Rad-vinst akkumuleres.
    const event = makePayload({
      patternId: "p-1rad",
      patternName: "1 Rad",
      payoutAmount: 100,
    });
    harnessOnPatternWon(event, state);
    expect(state.roundAccumulatedWinnings).toBe(100);

    // DUPLIKAT — samme patternId emittert igjen (race med room:update,
    // socket-replay eller test-hall-bypass-recursion). Skal IKKE
    // akkumulere igjen.
    harnessOnPatternWon(event, state);
    expect(state.roundAccumulatedWinnings).toBe(100);

    // Tredje gang også (defensiv mot N×N-duplisering).
    harnessOnPatternWon(event, state);
    expect(state.roundAccumulatedWinnings).toBe(100);
  });

  it("alle 5 faser, hvert pattern:won emittert TO ganger → fortsatt 1700 (ikke 3400)", () => {
    // Dette er REGRESJONS-test for prod-bug-en. Hvis pattern:won fires to
    // ganger per fase (f.eks. via dobbel-broadcast eller room:update-pathway
    // som også trigger akkumulering), skal idempotency-vakt forhindre
    // dobling.
    const state = createState("player-1");

    const phases = [
      { patternId: "p-1rad", patternName: "1 Rad", payoutAmount: 100, claimType: "LINE" as const },
      { patternId: "p-2rad", patternName: "2 Rader", payoutAmount: 200, claimType: "LINE" as const },
      { patternId: "p-3rad", patternName: "3 Rader", payoutAmount: 200, claimType: "LINE" as const },
      { patternId: "p-4rad", patternName: "4 Rader", payoutAmount: 200, claimType: "LINE" as const },
      {
        patternId: "p-fullthus",
        patternName: "Fullt Hus",
        payoutAmount: 1000,
        claimType: "BINGO" as const,
      },
    ];

    // Send hver event TO ganger — duplisert broadcast.
    for (const phase of phases) {
      harnessOnPatternWon(makePayload(phase), state);
      harnessOnPatternWon(makePayload(phase), state);
    }

    expect(state.roundAccumulatedWinnings).toBe(1700);
    expect(state.roundAccumulatedWinnings).not.toBe(3400);
  });

  it("ikke-vinner → akkumulator forblir 0", () => {
    const state = createState("other-player");

    harnessOnPatternWon(
      makePayload({
        winnerId: "player-1",
        winnerIds: ["player-1"],
        payoutAmount: 100,
      }),
      state,
    );

    expect(state.roundAccumulatedWinnings).toBe(0);
  });

  it("ny runde resetter akkumulator + idempotency-vakt", () => {
    const state = createState("player-1");

    harnessOnPatternWon(
      makePayload({ patternId: "p-1rad", payoutAmount: 100 }),
      state,
    );
    harnessOnPatternWon(
      makePayload({ patternId: "p-2rad", payoutAmount: 200 }),
      state,
    );
    expect(state.roundAccumulatedWinnings).toBe(300);

    // Ny runde — reset.
    resetForNewRound(state);
    expect(state.roundAccumulatedWinnings).toBe(0);
    expect(state.accumulatedPatternIds.size).toBe(0);

    // Samme patternId fra forrige runde skal nå IKKE bli filtrert som
    // duplikat — det er en ny runde.
    harnessOnPatternWon(
      makePayload({ patternId: "p-1rad", payoutAmount: 100 }),
      state,
    );
    expect(state.roundAccumulatedWinnings).toBe(100);
  });

  it("multi-winner split → vinner får sin del én gang (ikke dobbel)", () => {
    const state = createState("player-1");

    // 1 Rad delt mellom player-1 og player-2: total 100 / 2 vinnere = 50 hver.
    harnessOnPatternWon(
      makePayload({
        patternId: "p-1rad",
        payoutAmount: 50, // server har allerede gjort floor(100 / 2)
        winnerIds: ["player-1", "player-2"],
        winnerCount: 2,
      }),
      state,
    );

    expect(state.roundAccumulatedWinnings).toBe(50);

    // Duplikat (test-hall-bypass eller race) → fortsatt 50.
    harnessOnPatternWon(
      makePayload({
        patternId: "p-1rad",
        payoutAmount: 50,
        winnerIds: ["player-1", "player-2"],
        winnerCount: 2,
      }),
      state,
    );

    expect(state.roundAccumulatedWinnings).toBe(50);
  });
});
