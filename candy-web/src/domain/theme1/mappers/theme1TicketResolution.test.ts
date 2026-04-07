import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@/domain/realtime/contracts";
import { resolvePlayerContext } from "@/domain/theme1/mappers/theme1TicketResolution";

function createSnapshot(): RoomSnapshot {
  return {
    code: "ROOM01",
    hallId: "hall-1",
    hostPlayerId: "player-1",
    createdAt: "2026-03-13T10:00:00.000Z",
    players: [
      { id: "player-1", name: "Host", walletId: "wallet-1", balance: 1000 },
      { id: "player-2", name: "Guest", walletId: "wallet-2", balance: 1000 },
    ],
    currentGame: {
      id: "game-1",
      status: "RUNNING",
      entryFee: 30,
      ticketsPerPlayer: 1,
      prizePool: 30,
      remainingPrizePool: 30,
      payoutPercent: 75,
      maxPayoutBudget: 22,
      remainingPayoutBudget: 22,
      drawnNumbers: [],
      remainingNumbers: 60,
      claims: [],
      tickets: {
        "player-1": [
          {
            numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            grid: [],
          },
        ],
      },
      marks: {},
      startedAt: "2026-03-13T10:00:00.000Z",
    },
    preRoundTickets: {
      "player-1": [
        {
          numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          grid: [],
        },
      ],
    },
    gameHistory: [],
  };
}

describe("resolvePlayerContext", () => {
  it("falls through to candidate search when preferred player has no tickets (boards never blank)", () => {
    const snapshot = createSnapshot();

    const result = resolvePlayerContext(snapshot, "player-2");

    // player-2 has no tickets, but boards should never be blank.
    // Falls through to candidate search and finds player-1's tickets.
    expect(result.playerId).toBe("player-1");
    expect(result.source).toBe("currentGame");
    expect(result.tickets.length).toBeGreaterThan(0);
  });

  it("keeps current-game tickets when ended so boards stay visible between rounds", () => {
    const snapshot = createSnapshot();
    snapshot.currentGame!.status = "ENDED";
    snapshot.currentGame!.tickets["player-2"] = [
      {
        numbers: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
        grid: [],
      },
    ];
    snapshot.preRoundTickets!["player-2"] = [
      {
        numbers: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
        grid: [],
      },
    ];

    const result = resolvePlayerContext(snapshot, "player-2");

    expect(result.playerId).toBe("player-2");
    // Current game tickets are kept so the board numbers don't disappear
    expect(result.source).toBe("currentGame");
    expect(result.tickets[0]?.numbers).toEqual([
      21, 22, 23, 24, 25,
      26, 27, 28, 29, 30,
      31, 32, 33, 34, 35,
    ]);
  });
});
