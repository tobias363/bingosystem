// PR-B3 (BIN-613) — admin physical-ticket API wrappers.
// Thin wrappers around `apps/backend/src/routes/adminPhysicalTickets.ts`
// (BIN-587 B4a). All endpoints require PHYSICAL_TICKET_WRITE permission
// and are hall-scoped per BIN-591 (HALL_OPERATOR sees only own hall).

import { apiRequest } from "./client.js";

export type PhysicalBatchStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export interface PhysicalTicketBatch {
  id: string;
  hallId: string;
  batchName: string;
  rangeStart: number;
  rangeEnd: number;
  defaultPriceCents: number;
  gameSlug: string | null;
  assignedGameId: string | null;
  status: PhysicalBatchStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListBatchesResponse {
  batches: PhysicalTicketBatch[];
  count: number;
}

export interface CreateBatchRequest {
  hallId: string;
  batchName: string;
  rangeStart: number;
  rangeEnd: number;
  defaultPriceCents: number;
  gameSlug?: string | null;
  assignedGameId?: string | null;
}

export interface UpdateBatchRequest {
  batchName?: string;
  defaultPriceCents?: number;
  gameSlug?: string | null;
  assignedGameId?: string | null;
  status?: PhysicalBatchStatus;
}

export interface GenerateResult {
  batchId: string;
  generated: number;
  firstUniqueId: string;
  lastUniqueId: string;
}

export interface LastRegisteredIdResponse {
  hallId: string;
  lastUniqueId: string | null;
  lastBatchId: string | null;
}

export interface TransferHallRequest {
  toHallId: string;
  reason: string;
}

export interface BatchTransfer {
  id: string;
  batchId: string;
  fromHallId: string;
  toHallId: string;
  reason: string;
  transferredBy: string;
  transferredAt: string;
  ticketCountAtTransfer: number;
}

export function listBatches(params: { hallId?: string; status?: PhysicalBatchStatus; limit?: number } = {}): Promise<ListBatchesResponse> {
  const q = new URLSearchParams();
  if (params.hallId) q.set("hallId", params.hallId);
  if (params.status) q.set("status", params.status);
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiRequest<ListBatchesResponse>(
    `/api/admin/physical-tickets/batches${qs ? `?${qs}` : ""}`,
    { auth: true }
  );
}

export function createBatch(body: CreateBatchRequest): Promise<PhysicalTicketBatch> {
  return apiRequest<PhysicalTicketBatch>("/api/admin/physical-tickets/batches", {
    method: "POST",
    body,
    auth: true,
  });
}

export function getBatch(id: string): Promise<PhysicalTicketBatch> {
  return apiRequest<PhysicalTicketBatch>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}`,
    { auth: true }
  );
}

export function updateBatch(id: string, body: UpdateBatchRequest): Promise<PhysicalTicketBatch> {
  return apiRequest<PhysicalTicketBatch>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}`,
    { method: "PUT", body, auth: true }
  );
}

export function deleteBatch(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}`,
    { method: "DELETE", auth: true }
  );
}

export function generateTickets(id: string): Promise<GenerateResult> {
  return apiRequest<GenerateResult>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}/generate`,
    { method: "POST", auth: true }
  );
}

export function lastRegisteredId(hallId: string): Promise<LastRegisteredIdResponse> {
  const q = new URLSearchParams({ hallId });
  return apiRequest<LastRegisteredIdResponse>(
    `/api/admin/physical-tickets/last-registered-id?${q.toString()}`,
    { auth: true }
  );
}

export function transferBatchToHall(id: string, body: TransferHallRequest): Promise<BatchTransfer> {
  return apiRequest<BatchTransfer>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}/transfer-hall`,
    { method: "POST", body, auth: true }
  );
}

export interface ListTransfersResponse {
  batchId: string;
  transfers: BatchTransfer[];
  count: number;
}

export function listTransfers(id: string): Promise<ListTransfersResponse> {
  return apiRequest<ListTransfersResponse>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}/transfers`,
    { auth: true }
  );
}

export interface AssignGameRequest {
  gameId: string;
}

export function assignBatchToGame(id: string, body: AssignGameRequest): Promise<PhysicalTicketBatch> {
  return apiRequest<PhysicalTicketBatch>(
    `/api/admin/physical-tickets/batches/${encodeURIComponent(id)}/assign-game`,
    { method: "POST", body, auth: true }
  );
}

// ── BIN-587 B4b: unique-id lookup + list ────────────────────────────────────

export type PhysicalTicketStatus = "UNSOLD" | "SOLD" | "VOIDED";

export type PhysicalTicketPattern =
  | "row_1"
  | "row_2"
  | "row_3"
  | "row_4"
  | "full_house";

export interface PhysicalTicket {
  id: string;
  batchId: string;
  uniqueId: string;
  hallId: string;
  status: PhysicalTicketStatus;
  priceCents: number | null;
  assignedGameId: string | null;
  soldAt: string | null;
  soldBy: string | null;
  buyerUserId: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedReason: string | null;
  createdAt: string;
  updatedAt: string;
  numbersJson: number[] | null;
  patternWon: PhysicalTicketPattern | null;
  wonAmountCents: number | null;
  evaluatedAt: string | null;
  isWinningDistributed: boolean;
  winningDistributedAt: string | null;
}

export interface CheckUniqueIdResponse {
  exists: boolean;
  sellable: boolean;
  ticket: PhysicalTicket | null;
}

export function checkUniqueId(uniqueId: string): Promise<CheckUniqueIdResponse> {
  return apiRequest<CheckUniqueIdResponse>("/api/admin/unique-ids/check", {
    method: "POST",
    body: { uniqueId },
    auth: true,
  });
}

export function getUniqueId(uniqueId: string): Promise<PhysicalTicket> {
  return apiRequest<PhysicalTicket>(
    `/api/admin/unique-ids/${encodeURIComponent(uniqueId)}`,
    { auth: true }
  );
}

export interface ListUniqueIdsResponse {
  tickets: PhysicalTicket[];
  count: number;
}

export function listUniqueIds(
  params: { hallId?: string; status?: PhysicalTicketStatus; limit?: number } = {}
): Promise<ListUniqueIdsResponse> {
  const q = new URLSearchParams();
  if (params.hallId) q.set("hallId", params.hallId);
  if (params.status) q.set("status", params.status);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiRequest<ListUniqueIdsResponse>(
    `/api/admin/unique-ids${qs ? `?${qs}` : ""}`,
    { auth: true }
  );
}

export interface UniqueIdTransactionEvent {
  at: string;
  event: string;
  actor: string | null;
  details: Record<string, unknown>;
}

export interface UniqueIdTransactionsResponse {
  uniqueId: string;
  currentStatus: PhysicalTicketStatus;
  events: UniqueIdTransactionEvent[];
}

export function getUniqueIdTransactions(uniqueId: string): Promise<UniqueIdTransactionsResponse> {
  return apiRequest<UniqueIdTransactionsResponse>(
    `/api/admin/unique-ids/${encodeURIComponent(uniqueId)}/transactions`,
    { auth: true }
  );
}

// ── BIN-640: single-ticket cashout ──────────────────────────────────────────

export interface CashoutRequest {
  payoutCents: number;
  notes?: string | null;
}

export interface PhysicalTicketCashout {
  id: string;
  ticketUniqueId: string;
  hallId: string;
  gameId: string | null;
  payoutCents: number;
  paidBy: string;
  paidAt: string;
  notes: string | null;
  otherData: Record<string, unknown>;
}

export interface CashoutResult {
  cashout: PhysicalTicketCashout;
  ticket: PhysicalTicket;
}

export function cashoutTicket(uniqueId: string, body: CashoutRequest): Promise<CashoutResult> {
  return apiRequest<CashoutResult>(
    `/api/admin/physical-tickets/${encodeURIComponent(uniqueId)}/cashout`,
    { method: "POST", body, auth: true }
  );
}

export interface GetCashoutResponse {
  uniqueId: string;
  status: PhysicalTicketStatus;
  cashedOut: boolean;
  cashout: PhysicalTicketCashout | null;
}

export function getCashout(uniqueId: string): Promise<GetCashoutResponse> {
  return apiRequest<GetCashoutResponse>(
    `/api/admin/physical-tickets/${encodeURIComponent(uniqueId)}/cashout`,
    { auth: true }
  );
}

// ── BIN-641: check-bingo ────────────────────────────────────────────────────

export interface CheckBingoRequest {
  gameId: string;
  numbers: number[];
}

export interface CheckBingoResponse {
  uniqueId: string;
  gameId: string;
  gameStatus: string;
  hasWon: boolean;
  winningPattern: PhysicalTicketPattern | null;
  matchedNumbers: number[];
  drawnNumbersCount: number;
  payoutEligible: boolean;
  alreadyEvaluated: boolean;
  evaluatedAt: string | null;
  wonAmountCents: number | null;
  isWinningDistributed: boolean;
}

export function checkBingo(uniqueId: string, body: CheckBingoRequest): Promise<CheckBingoResponse> {
  return apiRequest<CheckBingoResponse>(
    `/api/admin/physical-tickets/${encodeURIComponent(uniqueId)}/check-bingo`,
    { method: "POST", body, auth: true }
  );
}

// ── BIN-639: reward-all (bulk payout) ───────────────────────────────────────

export interface RewardAllRewardEntry {
  uniqueId: string;
  amountCents: number;
}

export interface RewardAllRequest {
  gameId: string;
  rewards: RewardAllRewardEntry[];
}

export type RewardAllDetailStatus =
  | "rewarded"
  | "skipped_already_distributed"
  | "skipped_not_stamped"
  | "skipped_not_won"
  | "skipped_wrong_game"
  | "ticket_not_found"
  | "invalid_amount";

export interface RewardAllDetail {
  uniqueId: string;
  status: RewardAllDetailStatus;
  amountCents?: number;
  cashoutId?: string;
  hallId?: string;
  message?: string;
}

export interface RewardAllResponse {
  rewardedCount: number;
  totalPayoutCents: number;
  skippedCount: number;
  details: RewardAllDetail[];
}

export function rewardAll(body: RewardAllRequest): Promise<RewardAllResponse> {
  return apiRequest<RewardAllResponse>(
    "/api/admin/physical-tickets/reward-all",
    { method: "POST", body, auth: true }
  );
}

// ── BIN-638: games in hall aggregate ────────────────────────────────────────

export interface PhysicalTicketGameInHallRow {
  gameId: string | null;
  name: string | null;
  status: "ACTIVE" | "INACTIVE" | null;
  sold: number;
  pendingCashoutCount: number;
  ticketsInPlay: number;
  cashedOut: number;
  totalRevenueCents: number;
}

export interface PhysicalTicketsGamesInHallTotals {
  sold: number;
  pendingCashoutCount: number;
  ticketsInPlay: number;
  cashedOut: number;
  totalRevenueCents: number;
  rowCount: number;
}

export interface PhysicalTicketsGamesInHallResponse {
  generatedAt: string;
  hallId: string;
  from: string | null;
  to: string | null;
  rows: PhysicalTicketGameInHallRow[];
  totals: PhysicalTicketsGamesInHallTotals;
}

export function listGamesInHall(
  params: { hallId: string; from?: string; to?: string; limit?: number }
): Promise<PhysicalTicketsGamesInHallResponse> {
  const q = new URLSearchParams();
  q.set("hallId", params.hallId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  return apiRequest<PhysicalTicketsGamesInHallResponse>(
    `/api/admin/physical-tickets/games/in-hall?${q.toString()}`,
    { auth: true }
  );
}

// ── Helper: list sold tickets for a game (existing route, used by PayoutTicketsPage) ──
export interface ListSoldForGameResponse {
  tickets: PhysicalTicket[];
  count: number;
}

export function listSoldTicketsForGame(
  gameId: string,
  params: { hallId?: string; limit?: number } = {}
): Promise<ListSoldForGameResponse> {
  const q = new URLSearchParams();
  if (params.hallId) q.set("hallId", params.hallId);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiRequest<ListSoldForGameResponse>(
    `/api/admin/physical-tickets/games/${encodeURIComponent(gameId)}/sold${qs ? `?${qs}` : ""}`,
    { auth: true }
  );
}
