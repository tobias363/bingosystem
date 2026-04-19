// PR-A4a (BIN-645) — shared game-history page.
//
// Legacy: report/game{1..3}History.html (744 + 390 + 394 linjer). Display each
// completed game session with ball-draws and winners per pattern. New
// implementation uses /api/admin/dashboard/game-history — full per-session
// rows. Ball-draw detail is out of scope (separate detail view behind
// session click); shown here as per-game aggregates.

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import { getGameHistory } from "../../../api/admin-reports.js";
import {
  defaultDateRange,
  formatCurrency,
  formatDateTime,
  renderReportShell,
  toIsoDate,
} from "./reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type { SessionRow } from "../../../../../../packages/shared-types/src/reports.js";

export interface GameHistoryOptions {
  title: string;
  gameType: "MAIN_GAME" | "DATABINGO";
  /** Optional URL params that scope to a single game (kept for 1:1 compat). */
  scope?: {
    gameId?: string;
    grpId?: string;
    hallname?: string;
  };
}

export async function renderGameHistoryPage(
  container: HTMLElement,
  opts: GameHistoryOptions
): Promise<void> {
  const tableHostId = "game-history-table";
  const scopeLabel = opts.scope?.hallname
    ? `${opts.scope.hallname}${opts.scope.gameId ? ` · ${opts.scope.gameId}` : ""}`
    : undefined;

  container.innerHTML = renderReportShell({
    title: opts.title,
    subtitle: scopeLabel,
    tableHostId,
  });

  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);

  const handle = DataTable.mount<SessionRow>(host, {
    rows: [],
    emptyMessage: t("no_data_available_in_table"),
    className: "game-history-list",
    dateRange: {
      initialFrom: from,
      initialTo: to,
      onChange: (f, tD) => {
        if (f) currentFrom = toIsoDate(f);
        if (tD) currentTo = toIsoDate(tD);
        void reload();
      },
    },
    csvExport: {
      filename: `${opts.gameType.toLowerCase()}-history-${currentFrom}_${currentTo}`,
    },
    columns: [
      { key: "gameId", title: t("game_id") },
      { key: "hallId", title: t("hall") },
      {
        key: "firstEventAt",
        title: t("started_at"),
        render: (r) => formatDateTime(r.firstEventAt),
      },
      {
        key: "lastEventAt",
        title: t("ended_at"),
        render: (r) => formatDateTime(r.lastEventAt),
      },
      { key: "playerCount", title: t("players"), align: "right" },
      {
        key: "totalStakes",
        title: t("total_stakes"),
        align: "right",
        render: (r) => formatCurrency(r.totalStakes),
      },
      {
        key: "totalPrizes",
        title: t("total_prizes"),
        align: "right",
        render: (r) => formatCurrency(r.totalPrizes),
      },
      {
        key: "net",
        title: t("net"),
        align: "right",
        render: (r) => formatCurrency(r.net),
      },
    ],
  });

  async function reload(): Promise<void> {
    try {
      const res = await getGameHistory({
        startDate: currentFrom,
        endDate: currentTo,
        gameType: opts.gameType,
        hallId: opts.scope?.hallname,
        limit: 500,
      });
      let rows = res.rows;
      if (opts.scope?.gameId) {
        rows = rows.filter((r) => r.gameId === opts.scope?.gameId);
      }
      handle.setRows(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.insertAdjacentHTML(
        "afterbegin",
        `<div class="alert alert-danger">${escapeHtml(msg)}</div>`
      );
    }
  }

  await reload();
}
