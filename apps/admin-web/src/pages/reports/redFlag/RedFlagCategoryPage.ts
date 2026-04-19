// PR-A4a (BIN-645) — /redFlagCategory (red-flag categories + drill-down).
//
// Legacy: report/redFlagCategories.html (460 linjer). Displays AML red-flag
// categories; click → list of players in that category.
// BACKEND GAPs: BIN-650 (categories list) + BIN-651 (players per category).
//
// REGULATORY: When BIN-651 lands, the players-drill-down MUST call
// logRedFlagPlayersViewed() for audit. That wiring is in place below.

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import {
  fetchRedFlagCategories,
  fetchRedFlagPlayers,
  logRedFlagPlayersViewed,
} from "../../../api/admin-reports-redflag.js";
import {
  defaultDateRange,
  formatCurrency,
  formatDateTime,
  renderReportShell,
  toIsoDate,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type {
  RedFlagCategory,
  RedFlagPlayerEntry,
} from "../../../../../../packages/shared-types/src/reports.js";

export async function renderRedFlagCategoryPage(
  container: HTMLElement,
  categoryId?: string
): Promise<void> {
  if (categoryId) {
    await renderPlayersForCategory(container, categoryId);
    return;
  }
  await renderCategoryList(container);
}

async function renderCategoryList(container: HTMLElement): Promise<void> {
  const tableHostId = "redflag-categories-table";
  const res = await fetchRedFlagCategories();

  container.innerHTML = renderReportShell({
    title: t("red_flag_category"),
    tableHostId,
    gapBanner: res.isPlaceholder
      ? { issueId: "BIN-650", message: t("gap_red_flag_categories") }
      : undefined,
  });

  const host = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!host) return;

  DataTable.mount<RedFlagCategory>(host, {
    rows: res.categories,
    emptyMessage: t("no_data_available_in_table"),
    className: "redflag-categories",
    csvExport: { filename: "redflag-categories" },
    columns: [
      { key: "name", title: t("name") },
      { key: "description", title: t("description") },
      {
        key: "severity",
        title: t("severity"),
        align: "center",
        render: (r) => {
          const cls =
            r.severity === "HIGH"
              ? "label-danger"
              : r.severity === "MEDIUM"
                ? "label-warning"
                : "label-info";
          return `<span class="label ${cls}">${escapeHtml(r.severity)}</span>`;
        },
      },
      { key: "playerCount", title: t("players"), align: "right" },
      {
        key: "id",
        title: t("actions"),
        align: "center",
        render: (r) =>
          `<a class="btn btn-info btn-xs btn-rounded" href="#/redFlagCategory/${encodeURIComponent(r.id)}/players" title="${escapeHtml(t("view"))}"><i class="fa fa-eye"></i></a>`,
      },
    ],
  });
}

async function renderPlayersForCategory(
  container: HTMLElement,
  categoryId: string
): Promise<void> {
  // REGULATORY BIN-651: audit-log access. Fire-and-forget.
  void logRedFlagPlayersViewed(categoryId);

  const tableHostId = "redflag-players-table";
  const { from, to } = defaultDateRange();
  let currentFrom = toIsoDate(from);
  let currentTo = toIsoDate(to);

  const first = await fetchRedFlagPlayers({
    categoryId,
    startDate: currentFrom,
    endDate: currentTo,
  });

  container.innerHTML = renderReportShell({
    title: `${t("red_flag_category")} — ${t("players")}`,
    subtitle: categoryId,
    tableHostId,
    gapBanner: first.isPlaceholder
      ? { issueId: "BIN-651", message: t("gap_red_flag_players") }
      : undefined,
  });

  const hostEl = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  const handle = DataTable.mount<RedFlagPlayerEntry>(host, {
    rows: first.players,
    emptyMessage: t("no_data_available_in_table"),
    className: "redflag-players",
    dateRange: {
      initialFrom: from,
      initialTo: to,
      onChange: (f, tD) => {
        if (f) currentFrom = toIsoDate(f);
        if (tD) currentTo = toIsoDate(tD);
        void reload();
      },
    },
    csvExport: { filename: `redflag-players-${categoryId}` },
    columns: [
      { key: "displayName", title: t("name") },
      { key: "email", title: t("email") },
      {
        key: "flaggedAt",
        title: t("flagged_at"),
        render: (r) => formatDateTime(r.flaggedAt),
      },
      {
        key: "totalStakes",
        title: t("total_stakes"),
        align: "right",
        render: (r) => formatCurrency(r.totalStakes),
      },
      {
        key: "lastActivity",
        title: t("last_activity"),
        render: (r) => formatDateTime(r.lastActivity),
      },
      {
        key: "userId",
        title: t("actions"),
        align: "center",
        render: (r) =>
          `<a class="btn btn-info btn-xs btn-rounded" href="#/redFlagCategory/userTransaction/${encodeURIComponent(r.userId)}" title="${escapeHtml(t("view"))}"><i class="fa fa-eye"></i></a>`,
      },
    ],
  });

  async function reload(): Promise<void> {
    try {
      const res = await fetchRedFlagPlayers({
        categoryId,
        startDate: currentFrom,
        endDate: currentTo,
      });
      handle.setRows(res.players);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.insertAdjacentHTML(
        "afterbegin",
        `<div class="alert alert-danger">${escapeHtml(msg)}</div>`
      );
    }
  }
}
