// ── Socket.IO event contract ────────────────────────────────────────────────
// Codifies the event names and payload types exchanged between client and server.

import type { RoomSnapshot, Ticket, Player } from "./game.js";

// ── Event names ─────────────────────────────────────────────────────────────

export const SocketEvents = {
  // Client → Server (with ack)
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_RESUME: "room:resume",
  ROOM_CONFIGURE: "room:configure",
  ROOM_STATE: "room:state",
  BET_ARM: "bet:arm",
  GAME_START: "game:start",
  GAME_END: "game:end",
  DRAW_NEXT: "draw:next",
  DRAW_EXTRA_PURCHASE: "draw:extra:purchase",
  TICKET_MARK: "ticket:mark",
  CLAIM_SUBMIT: "claim:submit",
  LUCKY_SET: "lucky:set",
  CHAT_SEND: "chat:send",
  CHAT_HISTORY: "chat:history",
  LEADERBOARD_GET: "leaderboard:get",
  // Server → Client (broadcast)
  ROOM_UPDATE: "room:update",
  DRAW_NEW: "draw:new",
  PATTERN_WON: "pattern:won",
  CHAT_MESSAGE: "chat:message",
} as const;

// ── Generic ack response ────────────────────────────────────────────────────

export interface AckResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ── Client → Server payloads ────────────────────────────────────────────────

export interface AuthenticatedSocketPayload {
  accessToken?: string;
}

export interface RoomActionPayload extends AuthenticatedSocketPayload {
  roomCode: string;
  playerId?: string;
}

export interface RoomCreatePayload extends AuthenticatedSocketPayload {
  playerName?: string;
  walletId?: string;
  hallId?: string;
  gameSlug?: string;
}

export interface RoomJoinPayload extends AuthenticatedSocketPayload {
  roomCode: string;
  playerName?: string;
  walletId?: string;
  hallId?: string;
}

export interface BetArmPayload extends RoomActionPayload {
  armed?: boolean;
}

export interface GameStartPayload extends RoomActionPayload {
  entryFee?: number;
  ticketsPerPlayer?: number;
}

export interface TicketMarkPayload extends RoomActionPayload {
  number: number;
}

export interface ClaimSubmitPayload extends RoomActionPayload {
  type: "LINE" | "BINGO";
}

export interface LuckyNumberPayload extends RoomActionPayload {
  luckyNumber: number;
}

export interface ChatSendPayload extends RoomActionPayload {
  message: string;
  emojiId?: number;
}

// ── Server → Client payloads ────────────────────────────────────────────────

export type RoomUpdatePayload = RoomSnapshot & {
  scheduler: Record<string, unknown>;
  preRoundTickets: Record<string, Ticket[]>;
  luckyNumbers: Record<string, number>;
  serverTimestamp: number;
};

export interface DrawNewPayload {
  number: number;
  drawIndex: number;
  gameId: string;
}

export interface PatternWonPayload {
  patternId: string;
  patternName: string;
  winnerId: string;
  wonAtDraw: number;
  payoutAmount: number;
  claimType: "LINE" | "BINGO";
  gameId: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  emojiId: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  nickname: string;
  points: number;
}

// ── Scheduler settings (sent inside room:update scheduler field) ────────────

export interface BingoSchedulerSettings {
  autoRoundStartEnabled: boolean;
  autoRoundStartIntervalMs: number;
  autoRoundMinPlayers: number;
  autoRoundTicketsPerPlayer: number;
  autoRoundEntryFee: number;
  payoutPercent: number;
  autoDrawEnabled: boolean;
  autoDrawIntervalMs: number;
}
