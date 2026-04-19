// PR-A4b (BIN-659) — admin-settlement API wrappers.
//
// Thin, typed wrappers around the 3 agent-settlement admin endpoints:
//   - GET  /api/admin/shifts/settlements                 (list + filters)
//   - GET  /api/admin/shifts/:shiftId/settlement         (view one)
//   - PUT  /api/admin/shifts/:shiftId/settlement         (admin edit)
// PDF is fetched directly via `window.open()` — see buildSettlementPdfUrl()
// for the URL helper used by SettlementPage.
//
// Backend references:
//   apps/backend/src/routes/agentSettlement.ts:239 (list), :261 (get),
//   :279 (pdf), :314 (edit)
//   apps/backend/src/agent/AgentSettlementStore.ts:11 (AgentSettlement type)

import { apiRequest } from "./client.js";

// ── Settlement wire-shape (mirrors backend/agent/AgentSettlementStore) ──────

export interface AdminSettlement {
  id: string;
  shiftId: string;
  agentUserId: string;
  hallId: string;
  businessDate: string;
  dailyBalanceAtStart: number;
  dailyBalanceAtEnd: number;
  reportedCashCount: number;
  dailyBalanceDifference: number;
  settlementToDropSafe: number;
  withdrawFromTotalBalance: number;
  totalDropSafe: number;
  shiftCashInTotal: number;
  shiftCashOutTotal: number;
  shiftCardInTotal: number;
  shiftCardOutTotal: number;
  settlementNote: string | null;
  closedByUserId: string;
  isForced: boolean;
  editedByUserId: string | null;
  editedAt: string | null;
  editReason: string | null;
  otherData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── GET /api/admin/shifts/settlements ───────────────────────────────────────

export interface ListSettlementsQuery {
  hallId?: string;
  agentUserId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface ListSettlementsResponse {
  settlements: AdminSettlement[];
  limit: number;
  offset: number;
}

export async function listSettlements(q: ListSettlementsQuery = {}): Promise<ListSettlementsResponse> {
  const qs = buildQs(q);
  const path = qs ? `/api/admin/shifts/settlements?${qs}` : "/api/admin/shifts/settlements";
  return apiRequest<ListSettlementsResponse>(path, { auth: true });
}

// ── GET /api/admin/shifts/:shiftId/settlement ───────────────────────────────

export async function getSettlement(shiftId: string): Promise<AdminSettlement> {
  return apiRequest<AdminSettlement>(
    `/api/admin/shifts/${encodeURIComponent(shiftId)}/settlement`,
    { auth: true }
  );
}

// ── PUT /api/admin/shifts/:shiftId/settlement ───────────────────────────────

export interface EditSettlementBody {
  reason: string;
  reportedCashCount?: number;
  settlementToDropSafe?: number;
  withdrawFromTotalBalance?: number;
  totalDropSafe?: number;
  settlementNote?: string | null;
  otherData?: Record<string, unknown>;
}

export async function editSettlement(shiftId: string, body: EditSettlementBody): Promise<AdminSettlement> {
  return apiRequest<AdminSettlement>(
    `/api/admin/shifts/${encodeURIComponent(shiftId)}/settlement`,
    { auth: true, method: "PUT", body }
  );
}

// ── PDF URL helper ──────────────────────────────────────────────────────────
// Settlement PDF is delivered as a direct stream via
// `/api/admin/shifts/:shiftId/settlement.pdf`. Use window.open() on this URL;
// the browser handles the download dialog.

export function buildSettlementPdfUrl(shiftId: string): string {
  return `/api/admin/shifts/${encodeURIComponent(shiftId)}/settlement.pdf`;
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
