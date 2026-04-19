// PR-A4a (BIN-645) — physical-tickets aggregate wrapper (GAP: BIN-648).
//
// Legacy /reportPhysical/physicalTicketReport returned daily sold/unsold
// physical ticket counts per hall. Backend exposes per-shift cashouts via
// adminHallReports + per-ticket CRUD via adminPhysicalTickets, but no range
// aggregate. BIN-648 tracks the new GET /api/admin/reports/physical-tickets.
//
// Same pattern as admin-reports-drill.ts: wrapper attempts real endpoint, falls
// back to placeholder on 404/501.

import { apiRequest, ApiError } from "./client.js";
import type {
  PhysicalTicketReportRow,
  UniqueTicketRow,
} from "../../../../packages/shared-types/src/reports.js";

export const hasBackendGap = true;

export interface PhysicalTicketReportQuery {
  startDate: string;
  endDate: string;
  hallId?: string;
}

export interface PhysicalTicketReportResult {
  rows: PhysicalTicketReportRow[];
  isPlaceholder: boolean;
}

export async function fetchPhysicalTicketReport(
  q: PhysicalTicketReportQuery
): Promise<PhysicalTicketReportResult> {
  const qs = new URLSearchParams({ startDate: q.startDate, endDate: q.endDate });
  if (q.hallId) qs.set("hallId", q.hallId);
  try {
    const res = await apiRequest<{ rows: PhysicalTicketReportRow[] }>(
      `/api/admin/reports/physical-tickets?${qs}`,
      { auth: true }
    );
    return { rows: res.rows, isPlaceholder: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { rows: [], isPlaceholder: true };
    }
    throw err;
  }
}

// ── BIN-649: unique-ticket range report ─────────────────────────────────────

export interface UniqueTicketQuery {
  startDate: string;
  endDate: string;
  hallId?: string;
}

export interface UniqueTicketResult {
  rows: UniqueTicketRow[];
  isPlaceholder: boolean;
}

export async function fetchUniqueTicketReport(
  q: UniqueTicketQuery
): Promise<UniqueTicketResult> {
  const qs = new URLSearchParams({ startDate: q.startDate, endDate: q.endDate });
  if (q.hallId) qs.set("hallId", q.hallId);
  try {
    const res = await apiRequest<{ rows: UniqueTicketRow[] }>(
      `/api/admin/reports/unique-tickets?${qs}`,
      { auth: true }
    );
    return { rows: res.rows, isPlaceholder: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { rows: [], isPlaceholder: true };
    }
    throw err;
  }
}
