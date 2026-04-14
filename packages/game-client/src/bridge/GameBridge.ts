import type {
  RoomUpdatePayload,
  DrawNewPayload,
  PatternWonPayload,
  ChatMessage,
  JackpotActivatedPayload,
} from "@spillorama/shared-types/socket-events";
import type {
  RoomSnapshot,
  GameSnapshot,
  Player,
  Ticket,
  PatternDefinition,
  PatternResult,
  GameStatus,
} from "@spillorama/shared-types/game";
import type { SpilloramaSocket } from "../net/SpilloramaSocket.js";

// ── Derived game state (what game scenes consume) ───────────────────────────

export interface GameState {
  roomCode: string;
  hallId: string;
  gameStatus: GameStatus | "NONE";
  gameId: string | null;
  players: Player[];
  playerCount: number;

  // Draw state
  drawnNumbers: number[];
  lastDrawnNumber: number | null;
  drawCount: number;
  totalDrawCapacity: number;

  // Tickets & marks
  myTickets: Ticket[];
  myMarks: number[][];
  myPlayerId: string | null;

  // Patterns
  patterns: PatternDefinition[];
  patternResults: PatternResult[];

  // Prize
  prizePool: number;
  entryFee: number;

  // Lucky number
  myLuckyNumber: number | null;
  luckyNumbers: Record<string, number>;

  // Scheduler
  millisUntilNextStart: number | null;
  autoDrawEnabled: boolean;

  // Pre-round display tickets (for unarmed players)
  preRoundTickets: Ticket[];

  // Server time for sync
  serverTimestamp: number;
}

// ── Event types ─────────────────────────────────────────────────────────────

export interface GameBridgeEvents {
  stateChanged: (state: GameState) => void;
  gameStarted: (state: GameState) => void;
  gameEnded: (state: GameState) => void;
  numberDrawn: (number: number, drawIndex: number, state: GameState) => void;
  patternWon: (result: PatternWonPayload, state: GameState) => void;
  chatMessage: (message: ChatMessage) => void;
  jackpotActivated: (data: JackpotActivatedPayload) => void;
}

type EventMap = {
  [K in keyof GameBridgeEvents]: Set<GameBridgeEvents[K]>;
};

// ── Bridge ──────────────────────────────────────────────────────────────────

/**
 * Translates raw socket events into game-specific derived state.
 * Replaces SpilloramaGameBridge.cs from Unity.
 *
 * Game scenes subscribe to high-level events (gameStarted, numberDrawn, etc.)
 * instead of parsing raw RoomUpdatePayload directly.
 */
export class GameBridge {
  private socket: SpilloramaSocket;
  private state: GameState;
  private myPlayerId: string | null = null;
  private previousGameStatus: GameStatus | "NONE" = "NONE";
  private unsubscribers: (() => void)[] = [];
  private events: EventMap = {
    stateChanged: new Set(),
    gameStarted: new Set(),
    gameEnded: new Set(),
    numberDrawn: new Set(),
    patternWon: new Set(),
    chatMessage: new Set(),
    jackpotActivated: new Set(),
  };

  constructor(socket: SpilloramaSocket) {
    this.socket = socket;
    this.state = this.createEmptyState();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start(myPlayerId: string | null): void {
    this.myPlayerId = myPlayerId;
    this.state.myPlayerId = myPlayerId;

    this.unsubscribers.push(
      this.socket.on("roomUpdate", (payload) => this.handleRoomUpdate(payload)),
      this.socket.on("drawNew", (payload) => this.handleDrawNew(payload)),
      this.socket.on("patternWon", (payload) => this.handlePatternWon(payload)),
      this.socket.on("chatMessage", (msg) => this.emit("chatMessage", msg)),
      this.socket.on("jackpotActivated", (data) => this.emit("jackpotActivated", data)),
    );
  }

  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.state = this.createEmptyState();
  }

  getState(): GameState {
    return this.state;
  }

  // ── Event subscription ────────────────────────────────────────────────

  on<K extends keyof GameBridgeEvents>(
    event: K,
    listener: GameBridgeEvents[K],
  ): () => void {
    const set = this.events[event] as Set<GameBridgeEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  // ── Apply initial snapshot (from room:join response) ──────────────────

  applySnapshot(snapshot: RoomSnapshot): void {
    this.state.roomCode = snapshot.code;
    this.state.hallId = snapshot.hallId;
    this.state.players = snapshot.players;
    this.state.playerCount = snapshot.players.length;

    if (snapshot.currentGame) {
      this.applyGameSnapshot(snapshot.currentGame);
    } else {
      this.state.gameStatus = "NONE";
      this.state.gameId = null;
    }

    this.emit("stateChanged", this.state);
  }

  // ── Socket event handlers ─────────────────────────────────────────────

  private handleRoomUpdate(payload: RoomUpdatePayload): void {
    this.state.roomCode = payload.code;
    this.state.hallId = payload.hallId;
    this.state.players = payload.players;
    this.state.playerCount = payload.players.length;
    this.state.serverTimestamp = payload.serverTimestamp;
    this.state.luckyNumbers = payload.luckyNumbers;

    // Lucky number for this player
    if (this.myPlayerId && payload.luckyNumbers[this.myPlayerId] !== undefined) {
      this.state.myLuckyNumber = payload.luckyNumbers[this.myPlayerId];
    }

    // Pre-round tickets
    if (this.myPlayerId && payload.preRoundTickets[this.myPlayerId]) {
      this.state.preRoundTickets = payload.preRoundTickets[this.myPlayerId];
    }

    // Scheduler
    const scheduler = payload.scheduler as Record<string, unknown>;
    if (typeof scheduler?.millisUntilNextStart === "number") {
      this.state.millisUntilNextStart = scheduler.millisUntilNextStart;
    }
    if (typeof scheduler?.autoDrawEnabled === "boolean") {
      this.state.autoDrawEnabled = scheduler.autoDrawEnabled;
    }

    // Game state
    const prevStatus = this.previousGameStatus;
    if (payload.currentGame) {
      this.applyGameSnapshot(payload.currentGame);
    } else {
      this.state.gameStatus = "NONE";
      this.state.gameId = null;
    }

    // Detect game lifecycle transitions
    const newStatus = this.state.gameStatus;
    if (prevStatus !== "RUNNING" && newStatus === "RUNNING") {
      this.emit("gameStarted", this.state);
    }
    if (prevStatus === "RUNNING" && newStatus !== "RUNNING") {
      this.emit("gameEnded", this.state);
    }
    this.previousGameStatus = newStatus;

    this.emit("stateChanged", this.state);
  }

  private handleDrawNew(payload: DrawNewPayload): void {
    this.state.drawnNumbers.push(payload.number);
    this.state.lastDrawnNumber = payload.number;
    this.state.drawCount = this.state.drawnNumbers.length;
    this.emit("numberDrawn", payload.number, payload.drawIndex, this.state);
    this.emit("stateChanged", this.state);
  }

  private handlePatternWon(payload: PatternWonPayload): void {
    // Update local pattern results
    const existing = this.state.patternResults.find(
      (r) => r.patternId === payload.patternId,
    );
    if (existing) {
      existing.isWon = true;
      existing.winnerId = payload.winnerId;
      existing.wonAtDraw = payload.wonAtDraw;
      existing.payoutAmount = payload.payoutAmount;
    }
    this.emit("patternWon", payload, this.state);
    this.emit("stateChanged", this.state);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private applyGameSnapshot(game: GameSnapshot): void {
    this.state.gameStatus = game.status;
    this.state.gameId = game.id;
    this.state.drawnNumbers = [...game.drawnNumbers];
    this.state.lastDrawnNumber =
      game.drawnNumbers.length > 0
        ? game.drawnNumbers[game.drawnNumbers.length - 1]
        : null;
    this.state.drawCount = game.drawnNumbers.length;
    this.state.totalDrawCapacity = game.drawBag.length + game.drawnNumbers.length;
    this.state.prizePool = game.prizePool;
    this.state.entryFee = game.entryFee;
    this.state.patterns = game.patterns || [];
    this.state.patternResults = game.patternResults || [];

    // My tickets and marks
    if (this.myPlayerId) {
      this.state.myTickets = game.tickets[this.myPlayerId] || [];
      this.state.myMarks = game.marks[this.myPlayerId] || [];
      console.log("[GameBridge] applyGameSnapshot: playerId=", this.myPlayerId,
        "ticketKeys=", Object.keys(game.tickets),
        "myTickets=", this.state.myTickets.length,
        "myMarks=", this.state.myMarks.length);
    }
  }

  private createEmptyState(): GameState {
    return {
      roomCode: "",
      hallId: "",
      gameStatus: "NONE",
      gameId: null,
      players: [],
      playerCount: 0,
      drawnNumbers: [],
      lastDrawnNumber: null,
      drawCount: 0,
      totalDrawCapacity: 0,
      myTickets: [],
      myMarks: [],
      myPlayerId: null,
      patterns: [],
      patternResults: [],
      prizePool: 0,
      entryFee: 0,
      myLuckyNumber: null,
      luckyNumbers: {},
      millisUntilNextStart: null,
      autoDrawEnabled: false,
      preRoundTickets: [],
      serverTimestamp: 0,
    };
  }

  private emit<K extends keyof GameBridgeEvents>(
    event: K,
    ...args: Parameters<GameBridgeEvents[K]>
  ): void {
    const set = this.events[event];
    for (const fn of set) {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }
}
