// PR-A4a (BIN-645) — /reportGame1/subgames/:id (sub-game drill-down).
//
// Legacy: legacy/unity-backend/App/Views/report/subgame1reports.html (226 linjer).
// BACKEND GAP: BIN-647 — endpoint /api/admin/reports/games/bingo/:gameId/subgames
// not yet implemented. Page mounts with gap-banner + empty DataTable + working
// filter bar; will activate automatically when backend lands.

import { t } from "../../../i18n/I18n.js";
import { DataTable } from "../../../components/DataTable.js";
import { fetchSubgameDrillDown } from "../../../api/admin-reports-drill.js";
import { renderReportShell, formatCurrency } from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";
import type { SubgameReportRow } from "../../../../../../packages/shared-types/src/reports.js";

export async function renderGame1SubgamesPage(
  container: HTMLElement,
  gameId: string
): Promise<void> {
  const tableHostId = "subgame-drilldown-table";
  const res = await fetchSubgameDrillDown({ gameId });

  container.innerHTML = renderReportShell({
    title: t("subgame_report"),
    subtitle: `${t("match")} #${gameId}`,
    tableHostId,
    gapBanner: res.isPlaceholder
      ? { issueId: "BIN-647", message: t("gap_subgame_drilldown") }
      : undefined,
  });

  const host = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!host) return;

  DataTable.mount<SubgameReportRow>(host, {
    rows: res.rows,
    emptyMessage: t("no_data_available_in_table"),
    className: "subgame-drilldown",
    csvExport: { filename: `subgame-${gameId}` },
    columns: [
      { key: "subgameId", title: t("sub_game") },
      { key: "patternName", title: t("pattern_name") },
      { key: "roundCount", title: t("rounds"), align: "right" },
      { key: "winnerCount", title: t("winners"), align: "right" },
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

  // Breadcrumb back-link in case user wants to return.
  const breadcrumb = container.querySelector(".breadcrumb");
  if (breadcrumb) {
    const back = document.createElement("li");
    back.innerHTML = `<a href="#/reportGame1">${escapeHtml(t("game1"))}</a>`;
    breadcrumb.insertBefore(back, breadcrumb.lastElementChild);
  }
}
