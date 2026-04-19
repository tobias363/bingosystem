// PR-A4a (BIN-645) — red-flag categories + players wrapper (GAPs: BIN-650 + BIN-651).
//
// Legacy /redFlagCategory returned AML red-flag categories, and the nested
// /getPlayersRedFlagList returned the players flagged inside each category.
// Backend adminAml.ts exposes red-flag RULES and red-flag INSTANCES (per-user),
// but no aggregated CATEGORY + PLAYER-LIST shape. Gaps tracked as:
//   - BIN-650: GET /api/admin/red-flags/categories
//   - BIN-651: GET /api/admin/red-flags/players?categoryId&startDate&endDate
//              + audit-endpoint admin.report.red_flag_players.viewed
//
// REGULATORY: red-flag-players-viewer MUST audit-log access when BIN-651 lands.
// The audit endpoint (admin.report.red_flag_players.viewed) is part of
// BIN-651's scope (see PR-B2 pattern). Until endpoint exists, we attempt the
// call and silently ignore 404/501 — the page reports the gap via banner.

import { apiRequest, ApiError } from "./client.js";
import type {
  RedFlagCategory,
  RedFlagPlayerEntry,
} from "../../../../packages/shared-types/src/reports.js";

export const hasBackendGap = true;

// ── BIN-650 ─────────────────────────────────────────────────────────────────

export interface RedFlagCategoryResult {
  categories: RedFlagCategory[];
  isPlaceholder: boolean;
}

export async function fetchRedFlagCategories(): Promise<RedFlagCategoryResult> {
  try {
    const res = await apiRequest<{ categories: RedFlagCategory[] }>(
      "/api/admin/red-flags/categories",
      { auth: true }
    );
    return { categories: res.categories, isPlaceholder: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { categories: [], isPlaceholder: true };
    }
    throw err;
  }
}

export async function fetchRedFlagCategory(categoryId: string): Promise<
  { category: RedFlagCategory | null; isPlaceholder: boolean }
> {
  try {
    const res = await apiRequest<{ category: RedFlagCategory }>(
      `/api/admin/red-flags/categories/${encodeURIComponent(categoryId)}`,
      { auth: true }
    );
    return { category: res.category, isPlaceholder: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { category: null, isPlaceholder: true };
    }
    throw err;
  }
}

// ── BIN-651 ─────────────────────────────────────────────────────────────────

export interface RedFlagPlayersQuery {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
}

export interface RedFlagPlayersResult {
  players: RedFlagPlayerEntry[];
  isPlaceholder: boolean;
}

export async function fetchRedFlagPlayers(q: RedFlagPlayersQuery): Promise<RedFlagPlayersResult> {
  const qs = new URLSearchParams();
  if (q.categoryId) qs.set("categoryId", q.categoryId);
  if (q.startDate) qs.set("startDate", q.startDate);
  if (q.endDate) qs.set("endDate", q.endDate);
  try {
    const res = await apiRequest<{ players: RedFlagPlayerEntry[] }>(
      `/api/admin/red-flags/players?${qs}`,
      { auth: true }
    );
    return { players: res.players, isPlaceholder: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { players: [], isPlaceholder: true };
    }
    throw err;
  }
}

/**
 * REGULATORY BIN-651: audit-log when a user views the red-flag players list.
 *
 * The endpoint `admin.report.red_flag_players.viewed` is part of BIN-651's
 * scope. Until it lands, we attempt the call and swallow 404/501 silently —
 * this keeps the FE side's call-site stable so when backend ships, audit
 * logging activates automatically without a FE redeploy.
 */
export async function logRedFlagPlayersViewed(categoryId?: string): Promise<void> {
  try {
    await apiRequest<{ ok: true }>("/api/admin/audit/log", {
      method: "POST",
      auth: true,
      body: {
        action: "admin.report.red_flag_players.viewed",
        timestamp: new Date().toISOString(),
        resource: categoryId ? `red-flag-category:${categoryId}` : undefined,
      },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      // Endpoint not deployed yet — non-fatal. BIN-651 will add it.
      return;
    }
    // Other errors: log but don't break UX.
    console.warn("[BIN-651] audit-log red-flag-players-viewed failed:", err);
  }
}
