// PR-A4a (BIN-645) — /physicalTicketReport.
//
// Legacy: report/physicalTicketReport.html (226 linjer).
// BACKEND GAP: BIN-648.

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import { fetchPhysicalTicketReport } from "../../../api/admin-reports-physical.js";
import {
  defaultDateRange,
  formatCurrency,
  renderReportShell,
  toIsoDate,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type { PhysicalTicketReportRow } from "../../../../../../packages/shared-types/src/reports.js";

export async function renderPhysicalTicketReportPage(container: HTMLElement): Promise<void> {
  const tableHostId = "physical-ticket-report-table";
  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);

  // Initial fetch to know if banner should appear.
  const first = await fetchPhysicalTicketReport({ startDate: currentFrom, endDate: currentTo });

  container.innerHTML = renderReportShell({
    title: t("physical_ticket"),
    tableHostId,
    gapBanner: first.isPlaceholder
      ? { issueId: "BIN-648", message: t("gap_physical_ticket_aggregate") }
      : undefined,
  });

  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const handle = DataTable.mount<PhysicalTicketReportRow>(host, {
    rows: first.rows,
    emptyMessage: t("no_data_available_in_table"),
    className: "physical-ticket-report",
    dateRange: {
      initialFrom: from,
      initialTo: to,
      onChange: (f, tD) => {
        if (f) currentFrom = toIsoDate(f);
        if (tD) currentTo = toIsoDate(tD);
        void reload();
      },
    },
    csvExport: { filename: `physical-ticket-${currentFrom}_${currentTo}` },
    columns: [
      { key: "date", title: t("date") },
      { key: "hallId", title: t("hall_id") },
      { key: "ticketsSold", title: t("tickets_sold"), align: "right" },
      { key: "ticketsRefunded", title: t("tickets_refunded"), align: "right" },
      {
        key: "totalStakes",
        title: t("total_stakes"),
        align: "right",
        render: (r) => formatCurrency(r.totalStakes),
      },
      {
        key: "totalPayouts",
        title: t("total_payouts"),
        align: "right",
        render: (r) => formatCurrency(r.totalPayouts),
      },
    ],
  });

  async function reload(): Promise<void> {
    try {
      const res = await fetchPhysicalTicketReport({
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
