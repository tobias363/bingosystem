// PR-A4b (BIN-659) — admin-payouts API wrappers.
//
// Wraps the two per-player / per-game payout drill-down endpoints. These
// differ from "payouts list" because backend intentionally does NOT expose
// a global "all players" list — staff must search for a player by id (from
// /api/admin/users or /api/admin/unique-ids) and then drill into their
// payout history.
//
// Backend references:
//   apps/backend/src/routes/adminUniqueIdsAndPayouts.ts
//     :177 GET /api/admin/payouts/by-player/:userId
//     :216 GET /api/admin/payouts/by-game/:gameId/tickets

import { apiRequest } from "./client.js";

// ── /api/admin/payouts/by-player/:userId ────────────────────────────────────

export interface PayoutPlayerSummaryDto {
  playerId: string;
  totalStakes: number;
  totalPrizes: number;
  net: number;
  gameCount: number;
}

export interface PayoutsByPlayerResponseDto {
  playerId: string;
  startDate: string;
  endDate: string;
  summary: PayoutPlayerSummaryDto;
}

export async function getPayoutsByPlayerDetail(q: {
  userId: string;
  startDate: string;
  endDate: string;
  hallId?: string;
}): Promise<PayoutsByPlayerResponseDto> {
  const qs = buildQs({ startDate: q.startDate, endDate: q.endDate, hallId: q.hallId });
  return apiRequest<PayoutsByPlayerResponseDto>(
    `/api/admin/payouts/by-player/${encodeURIComponent(q.userId)}?${qs}`,
    { auth: true }
  );
}

// ── /api/admin/payouts/by-game/:gameId/tickets ──────────────────────────────

export interface PhysicalTicketSoldDto {
  ticketId: string;
  uniqueId: string | null;
  gameId: string;
  hallId: string;
  amountCents?: number;
  soldAt: string;
  userId?: string | null;
}

export interface GameSessionSummaryDto {
  gameId: string;
  hallId?: string;
  totalStakes: number;
  totalPrizes: number;
  net: number;
  playerCount?: number;
}

export interface PayoutsByGameTicketsResponseDto {
  gameId: string;
  physicalTickets: PhysicalTicketSoldDto[];
  physicalTicketCount: number;
  sessionSummary: GameSessionSummaryDto | null;
}

export async function getPayoutsByGameTicketsDetail(q: {
  gameId: string;
  startDate?: string;
  endDate?: string;
  hallId?: string;
  limit?: number;
}): Promise<PayoutsByGameTicketsResponseDto> {
  const qs = buildQs({
    startDate: q.startDate,
    endDate: q.endDate,
    hallId: q.hallId,
    limit: q.limit,
  });
  const path = qs
    ? `/api/admin/payouts/by-game/${encodeURIComponent(q.gameId)}/tickets?${qs}`
    : `/api/admin/payouts/by-game/${encodeURIComponent(q.gameId)}/tickets`;
  return apiRequest<PayoutsByGameTicketsResponseDto>(path, { auth: true });
}

// ── helpers ─────────────────────────────────────────────────────────────────

function buildQs(obj: object): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "") continue;
    qs.set(k, String(v));
  }
  return qs.toString();
}
