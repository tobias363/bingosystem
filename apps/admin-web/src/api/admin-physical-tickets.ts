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
