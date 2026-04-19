// PR-A4a (BIN-645) — /hallSpecificReport.
//
// Legacy: report/hallReport.html (997 linjer). Hall-spesifikk rapport på
// tvers av spill. Legacy har 2 tabeller (orderTable + myTable) — vi
// kollapser til én daily-rapport + hall-velger, siden backend tilbyr
// /api/admin/reports/halls/:hallId/daily.

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import { getHallDailyReport } from "../../../api/admin-reports.js";
import { listHalls, type AdminHall } from "../../../api/dashboard.js";
import {
  defaultDateRange,
  formatCurrency,
  renderReportShell,
  toIsoDate,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type { HallAccountRow } from "../../../../../../packages/shared-types/src/reports.js";

export async function renderHallSpecificReportPage(container: HTMLElement): Promise<void> {
  const tableHostId = "hall-specific-report-table";
  container.innerHTML = renderReportShell({
    title: t("hall_specific_reports"),
    tableHostId,
  });
  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);
  let currentHallId = "";
  let halls: AdminHall[] = [];

  try {
    halls = await listHalls();
    currentHallId = halls[0]?.id ?? "";
  } catch {
    // Continue without halls — user sees empty dropdown.
  }

  const handle = DataTable.mount<HallAccountRow>(host, {
    rows: [],
    emptyMessage: t("no_data_available_in_table"),
    className: "hall-specific-report",
    dateRange: {
      initialFrom: from,
      initialTo: to,
      onChange: (f, tD) => {
        if (f) currentFrom = toIsoDate(f);
        if (tD) currentTo = toIsoDate(tD);
        void reload();
      },
    },
    toolbar: {
      extra: (slot) => {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;flex-direction:column;font-size:12px;";
        label.textContent = t("hall");
        const select = document.createElement("select");
        select.className = "form-control input-sm";
        select.innerHTML = halls
          .map((h) => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.name)}</option>`)
          .join("");
        select.value = currentHallId;
        select.addEventListener("change", () => {
          currentHallId = select.value;
          void reload();
        });
        label.append(select);
        slot.append(label);
      },
    },
    csvExport: {
      filename: `hall-specific-${currentFrom}_${currentTo}`,
    },
    columns: [
      { key: "date", title: t("date") },
      { key: "gameType", title: t("game_type"), render: (r) => r.gameType ?? "ALL" },
      {
        key: "ticketsSoldCents",
        title: t("gross_turnover"),
        align: "right",
        render: (r) => formatCurrency(r.ticketsSoldCents),
      },
      {
        key: "winningsPaidCents",
        title: t("prizes_paid"),
        align: "right",
        render: (r) => formatCurrency(r.winningsPaidCents),
      },
      {
        key: "netRevenueCents",
        title: t("net"),
        align: "right",
        render: (r) => formatCurrency(r.netRevenueCents),
      },
      {
        key: "cashInCents",
        title: t("amount_in"),
        align: "right",
        render: (r) => formatCurrency(r.cashInCents),
      },
      {
        key: "cashOutCents",
        title: t("amount_out"),
        align: "right",
        render: (r) => formatCurrency(r.cashOutCents),
      },
    ],
  });

  async function reload(): Promise<void> {
    if (!currentHallId) {
      handle.setRows([]);
      return;
    }
    try {
      const res = await getHallDailyReport({
        hallId: currentHallId,
        dateFrom: currentFrom,
        dateTo: currentTo,
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

  await reload();
}
