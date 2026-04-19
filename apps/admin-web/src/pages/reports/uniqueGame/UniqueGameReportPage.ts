// PR-A4a (BIN-645) — /uniqueGameReport.
//
// Legacy: report/unique1reports.html (281 linjer). Unique Game 1 ticket-ID
// rapport over range. BACKEND GAP: BIN-649 (new endpoint
// /api/admin/reports/unique-tickets).

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import { fetchUniqueTicketReport } from "../../../api/admin-reports-physical.js";
import {
  defaultDateRange,
  formatCurrency,
  formatDateTime,
  renderReportShell,
  toIsoDate,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type { UniqueTicketRow } from "../../../../../../packages/shared-types/src/reports.js";

export async function renderUniqueGameReportPage(container: HTMLElement): Promise<void> {
  const tableHostId = "unique-game-report-table";
  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);

  const first = await fetchUniqueTicketReport({ startDate: currentFrom, endDate: currentTo });

  container.innerHTML = renderReportShell({
    title: t("unique_ticket"),
    tableHostId,
    gapBanner: first.isPlaceholder
      ? { issueId: "BIN-649", message: t("gap_unique_ticket_range") }
      : undefined,
  });

  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const handle = DataTable.mount<UniqueTicketRow>(host, {
    rows: first.rows,
    emptyMessage: t("no_data_available_in_table"),
    className: "unique-ticket-report",
    dateRange: {
      initialFrom: from,
      initialTo: to,
      onChange: (f, tD) => {
        if (f) currentFrom = toIsoDate(f);
        if (tD) currentTo = toIsoDate(tD);
        void reload();
      },
    },
    csvExport: { filename: `unique-ticket-${currentFrom}_${currentTo}` },
    columns: [
      { key: "uniqueId", title: t("unique_id") },
      { key: "gameId", title: t("game_id") },
      { key: "hallId", title: t("hall_id") },
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
        key: "createdAt",
        title: t("created_at"),
        render: (r) => formatDateTime(r.createdAt),
      },
    ],
  });

  async function reload(): Promise<void> {
    try {
      const res = await fetchUniqueTicketReport({
        startDate: currentFrom,
        endDate: currentTo,
      });
      handle.setRows(res.rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.insertAdjacentHTML(
        "afterbegin",
        `<div class="alert alert-danger">${escapeHtml(msg)}</div>`
      );
    }
  }
}
