// PR-A4a (BIN-645) — subgame drill-down wrapper (GAP: BIN-647).
//
// Legacy /reportGame1/getGame1Subgames returned per-subgame aggregates within
// a single bingo match (pattern-level stats, winner counts). Backend does not
// yet expose this — tracked as BIN-647. Wrapper surfaces `hasBackendGap: true`
// so pages render the gap-banner + funktional filter bar but empty table.
//
// When BIN-647 lands, swap `fetchSubgameDrillDown` impl to real apiRequest and
// flip `hasBackendGap = false`. No page code needs to change.

import { apiRequest, ApiError } from "./client.js";
import type { SubgameReportRow } from "../../../../packages/shared-types/src/reports.js";

export const hasBackendGap = true;

export interface SubgameDrillDownQuery {
  gameId: string;
}

export interface SubgameDrillDownResult {
  gameId: string;
  rows: SubgameReportRow[];
  /** True while BIN-647 pending; callers may render gap-banner. */
  isPlaceholder: boolean;
}

/**
 * Fetch sub-game drill-down for a single bingo match. Currently returns empty
 * placeholder (BIN-647). The wrapper still attempts the real endpoint first —
 * if backend lands this silently, the page will work without a redeploy.
 */
export async function fetchSubgameDrillDown(
  q: SubgameDrillDownQuery
): Promise<SubgameDrillDownResult> {
  try {
    const res = await apiRequest<{ rows: SubgameReportRow[] }>(
      `/api/admin/reports/games/bingo/${encodeURIComponent(q.gameId)}/subgames`,
      { auth: true }
    );
    return { gameId: q.gameId, rows: res.rows, isPlaceholder: false };
  } catch (err) {
    // 404/501 → endpoint not deployed yet. Return placeholder.
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return { gameId: q.gameId, rows: [], isPlaceholder: true };
    }
    throw err;
  }
}
