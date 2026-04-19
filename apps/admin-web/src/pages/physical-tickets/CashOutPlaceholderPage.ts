// PR-B3 (BIN-613) — placeholder for physicalCashOut.
// Full-port of legacy/unity-backend/App/Views/physicalTickets/physicalCashOut.html
// requires per-game aggregate endpoints that are not yet delivered.
// Tracked as:
//   - BIN-638: GET /api/admin/games/in-hall?fromDate&toDate&hallId
//   - BIN-640: POST single-ticket cashout
//   - BIN-641: POST check-bingo
//
// This page renders a callout with the scope explanation + Linear-issue refs.

import { t } from "../../i18n/I18n.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

const LINEAR_ISSUES: Array<{ id: string; title: string; url: string }> = [
  {
    id: "BIN-638",
    title: "GET /api/admin/games/in-hall",
    url: "https://linear.app/bingosystem/issue/BIN-638",
  },
  {
    id: "BIN-640",
    title: "POST single-ticket cashout",
    url: "https://linear.app/bingosystem/issue/BIN-640",
  },
  {
    id: "BIN-641",
    title: "POST check-bingo",
    url: "https://linear.app/bingosystem/issue/BIN-641",
  },
];

export function renderCashOutPlaceholderPage(container: HTMLElement): void {
  const list = LINEAR_ISSUES.map(
    (issue) =>
      `<li><a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issue.id)}</a> — ${escapeHtml(issue.title)}</li>`
  ).join("");

  container.innerHTML = `
    ${contentHeader("physical_cash_out")}
    <section class="content">
      ${boxOpen("physical_cash_out", "default")}
        <div class="callout callout-info">
          <h4><i class="fa fa-info-circle"></i> ${escapeHtml(t("scope_dropped_title"))}</h4>
          <p>${escapeHtml(t("scope_dropped_cashout_body"))}</p>
        </div>
        <div class="alert alert-warning" role="alert">
          <strong>${escapeHtml(t("scope_dropped_see_linear"))}:</strong>
          <ul style="margin:8px 0 0 16px;">${list}</ul>
        </div>
      ${boxClose()}
    </section>`;
}
