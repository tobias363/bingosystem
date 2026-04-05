import { describe, expect, it } from "vitest";
import type { RealtimeRoomSnapshot } from "@/domain/realtime/contracts";
import {
  createTheme1BonusStateFromTrigger,
  extractNewTheme1BonusTrigger,
} from "@/domain/theme1/theme1BonusTrigger";

function createSnapshot(): RealtimeRoomSnapshot {
  return {
    code: "ROOM01",
    hallId: "hall-1",
    hostPlayerId: "player-1",
    createdAt: "2026-03-13T10:00:00.000Z",
    players: [
      {
        id: "player-1",
        name: "Tester",
        walletId: "wallet-1",
        balance: 1200,
      },
    ],
    currentGame: {
      id: "game-1",
      status: "RUNNING",
      entryFee: 30,
      ticketsPerPlayer: 4,
      prizePool: 900,
      remainingPrizePool: 840,
      payoutPercent: 75,
      maxPayoutBudget: 675,
      remainingPayoutBudget: 615,
      activePatternIndexes: [1],
      patternPayoutAmounts: [1500, 500, 300, 200, 100, 100, 40, 40, 10, 8, 3, 3],
      drawnNumbers: [4, 15, 29],
      remainingNumbers: 57,
      claims: [],
      tickets: {},
      marks: {},
      startedAt: "2026-03-13T10:00:10.000Z",
    },
    preRoundTickets: {},
    gameHistory: [],
    scheduler: {
      enabled: true,
      liveRoundsIndependentOfBet: true,
      intervalMs: 30000,
      minPlayers: 1,
      playerCount: 1,
      armedPlayerCount: 1,
      armedPlayerIds: ["player-1"],
      entryFee: 30,
      payoutPercent: 75,
      drawCapacity: 30,
      currentDrawCount: 3,
      remainingDrawCapacity: 27,
      nextStartAt: null,
      millisUntilNextStart: null,
      canStartNow: false,
      serverTime: "2026-03-13T10:00:20.000Z",
    },
  };
}

describe("extractNewTheme1BonusTrigger", () => {
  it("returns a fresh bonus-triggered pattern claim for the active player", () => {
    const snapshot = createSnapshot();
    snapshot.currentGame?.claims.push({
      id: "claim-bonus",
      playerId: "player-1",
      type: "PATTERN",
      valid: true,
      claimKind: "PATTERN_FAMILY",
      winningPatternIndex: 1,
      displayPatternNumber: 11,
      topperSlotIndex: 1,
      ticketIndex: 0,
      bonusTriggered: true,
      bonusAmount: 500,
      payoutAmount: 500,
      createdAt: "2026-03-13T10:00:20.000Z",
    });

    const result = extractNewTheme1BonusTrigger(snapshot, {
      playerId: "player-1",
      knownClaimIds: [],
      previousGameId: "game-1",
    });

    expect(result).toEqual({
      claimId: "claim-bonus",
      amountKr: 500,
      winningPatternIndex: 1,
      topperSlotIndex: 1,
    });
  });

  it("ignores already-seen bonus claims in the same game", () => {
    const snapshot = createSnapshot();
    snapshot.currentGame!.claims = [
      {
        id: "claim-bonus",
        playerId: "player-1",
        type: "PATTERN",
        valid: true,
        claimKind: "PATTERN_FAMILY",
        winningPatternIndex: 1,
        displayPatternNumber: 11,
        topperSlotIndex: 1,
        ticketIndex: 0,
        bonusTriggered: true,
        bonusAmount: 500,
        payoutAmount: 500,
        createdAt: "2026-03-13T10:00:20.000Z",
      },
    ];

    const result = extractNewTheme1BonusTrigger(snapshot, {
      playerId: "player-1",
      knownClaimIds: ["claim-bonus"],
      previousGameId: "game-1",
    });

    expect(result).toBeNull();
  });

  it("builds a live bonus round using the matching payout symbol when amount is known", () => {
    const bonus = createTheme1BonusStateFromTrigger({
      claimId: "claim-bonus",
      amountKr: 500,
      winningPatternIndex: 1,
      topperSlotIndex: 1,
    });

    expect(bonus.status).toBe("open");
    expect(bonus.slots.filter((slot) => slot.symbolId === "asset-10")).toHaveLength(3);
  });
});
