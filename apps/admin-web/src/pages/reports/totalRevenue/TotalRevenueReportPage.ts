// PR-A4a (BIN-645) — /totalRevenueReport.
//
// Legacy: report/totalRevenueReport.html (322 linjer). Totals + per-hall +
// per-game grouping over date range. New uses
// /api/admin/reports/revenue (totals) + /api/admin/reports/range (rows).

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import { getRangeReport, getRevenueSummary } from "../../../api/admin-reports.js";
import type { RangeReportRow } from "../../../api/admin-reports.js";
import {
  defaultDateRange,
  formatCurrency,
  renderReportShell,
  toIsoDate,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";

export async function renderTotalRevenueReportPage(container: HTMLElement): Promise<void> {
  const tableHostId = "total-revenue-table";
  container.innerHTML = renderReportShell({
    title: t("total_revenue_report"),
    tableHostId,
    extraBelow: `<div id="total-revenue-summary" class="well well-sm" style="margin-top:12px"></div>`,
  });

  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  const summaryHost = container.querySelector<HTMLElement>("#total-revenue-summary");
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);

  // Flatten `days[].rows[]` into a single list of day-rows.
  const handle = DataTable.mount<RangeReportRow>(host, {
    rows: [],
    emptyMessage: t("no_data_available_in_table"),
    className: "total-revenue",
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
      filename: `total-revenue-${currentFrom}_${currentTo}`,
    },
    columns: [
      { key: "date", title: t("date") },
      { key: "hallId", title: t("hall") },
      { key: "gameType", title: t("game_type") },
      { key: "channel", title: t("channel") },
      {
        key: "grossTurnover",
        title: t("gross_turnover"),
        align: "right",
        render: (r) => formatCurrency(r.grossTurnover),
      },
      {
        key: "prizesPaid",
        title: t("prizes_paid"),
        align: "right",
        render: (r) => formatCurrency(r.prizesPaid),
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
      const [summary, range] = await Promise.all([
        getRevenueSummary({ startDate: currentFrom, endDate: currentTo }),
        getRangeReport({ startDate: currentFrom, endDate: currentTo }),
      ]);
      const rows: RangeReportRow[] = range.days.flatMap((d) => d.rows);
      handle.setRows(rows);
      if (summaryHost) {
        summaryHost.innerHTML = `
          <strong>${escapeHtml(t("total_stakes"))}:</strong> ${formatCurrency(summary.totalStakes)} NOK &nbsp;·&nbsp;
          <strong>${escapeHtml(t("total_prizes"))}:</strong> ${formatCurrency(summary.totalPrizes)} NOK &nbsp;·&nbsp;
          <strong>${escapeHtml(t("net"))}:</strong> ${formatCurrency(summary.net)} NOK &nbsp;·&nbsp;
          <strong>${escapeHtml(t("rounds"))}:</strong> ${summary.roundCount} &nbsp;·&nbsp;
          <strong>${escapeHtml(t("unique_players"))}:</strong> ${summary.uniquePlayerCount}
        `;
      }
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
