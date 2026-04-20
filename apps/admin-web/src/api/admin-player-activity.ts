// PR-B2: admin player-activity API.
// Mirrors apps/backend/src/routes/adminPlayerActivity.ts
// (BIN-587 B5-rest + BIN-629 login-history + BIN-630 chips-history).

import { apiRequest } from "./client.js";

export interface WalletTransaction {
  id: string;
  walletId: string;
  amount: number;
  type: string;
  description?: string | null;
  externalRef?: string | null;
  createdAt: string;
}

export interface WalletTxResult {
  userId: string;
  walletId: string;
  transactions: WalletTransaction[];
  count: number;
}

export async function listPlayerTransactions(id: string, limit = 100): Promise<WalletTxResult> {
  return apiRequest<WalletTxResult>(
    `/api/admin/players/${encodeURIComponent(id)}/transactions?limit=${limit}`,
    { auth: true }
  );
}

export interface LedgerEntry {
  id: string;
  walletId: string;
  amount: number;
  type: string;
  gameId?: string | null;
  gameSlug?: string | null;
  hallId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface GameHistoryResult {
  userId: string;
  walletId: string;
  entries: LedgerEntry[];
  count: number;
}

export interface GameHistoryParams {
  dateFrom?: string;
  dateTo?: string;
  hallId?: string;
  limit?: number;
}

export async function listPlayerGameHistory(
  id: string,
  params: GameHistoryParams = {}
): Promise<GameHistoryResult> {
  const qs = new URLSearchParams();
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.hallId) qs.set("hallId", params.hallId);
  qs.set("limit", String(params.limit ?? 200));
  return apiRequest<GameHistoryResult>(
    `/api/admin/players/${encodeURIComponent(id)}/game-history?${qs}`,
    { auth: true }
  );
}

// ── BIN-629: Login-history ───────────────────────────────────────────────────

export interface LoginHistoryEntry {
  id: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  /** Stable failure code (`INVALID_CREDENTIALS`, …) for failed attempts. */
  failureReason: string | null;
}

export interface LoginHistoryResult {
  userId: string;
  from: string | null;
  to: string | null;
  items: LoginHistoryEntry[];
  /** Opaque base64url cursor. `null` = no further pages. */
  nextCursor: string | null;
}

export interface LoginHistoryParams {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export async function listPlayerLoginHistory(
  id: string,
  params: LoginHistoryParams = {}
): Promise<LoginHistoryResult> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString();
  return apiRequest<LoginHistoryResult>(
    `/api/admin/players/${encodeURIComponent(id)}/login-history${query ? `?${query}` : ""}`,
    { auth: true }
  );
}

// ── BIN-630: Chips-history ───────────────────────────────────────────────────

export type ChipsHistoryType =
  | "DEBIT"
  | "CREDIT"
  | "TOPUP"
  | "WITHDRAWAL"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export interface ChipsHistoryEntry {
  id: string;
  timestamp: string;
  type: ChipsHistoryType;
  /** NOK (ikke øre), positiv uansett retning; `type` gir retningen. */
  amount: number;
  /** Balanse etter raden. */
  balanceAfter: number;
  description: string;
  sourceGameId: string | null;
  refundedAt: string | null;
}

export interface ChipsHistoryResult {
  userId: string;
  walletId: string;
  from: string | null;
  to: string | null;
  items: ChipsHistoryEntry[];
  nextCursor: string | null;
}

export interface ChipsHistoryParams {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export async function listPlayerChipsHistory(
  id: string,
  params: ChipsHistoryParams = {}
): Promise<ChipsHistoryResult> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString();
  return apiRequest<ChipsHistoryResult>(
    `/api/admin/players/${encodeURIComponent(id)}/chips-history${query ? `?${query}` : ""}`,
    { auth: true }
  );
}
