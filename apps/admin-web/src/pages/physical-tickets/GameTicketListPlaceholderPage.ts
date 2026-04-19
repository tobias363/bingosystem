// PR-B3 (BIN-613) — placeholder for physicalGameTicketList.
// Full-port of legacy/unity-backend/App/Views/physicalTickets/physicalGameTicketList.html
// requires game-in-hall listing + reward-all + bingo-pattern verification
// + live socket.io broadcast. None of those endpoints are delivered yet.
// Tracked as:
//   - BIN-638: GET /api/admin/games/in-hall
//   - BIN-639: POST reward-all
//   - BIN-642: socket.io live-update (low prio)

import { t } from "../../i18n/I18n.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

const LINEAR_ISSUES: Array<{ id: string; title: string; url: string }> = [
  {
    id: "BIN-638",
    title: "GET /api/admin/games/in-hall",
    url: "https://linear.app/bingosystem/issue/BIN-638",
  },
  {
    id: "BIN-639",
    title: "POST reward-all",
    url: "https://linear.app/bingosystem/issue/BIN-639",
  },
  {
    id: "BIN-642",
    title: "socket.io live-update (low prio)",
    url: "https://linear.app/bingosystem/issue/BIN-642",
  },
];

export function renderGameTicketListPlaceholderPage(container: HTMLElement): void {
  const list = LINEAR_ISSUES.map(
    (issue) =>
      `<li><a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issue.id)}</a> — ${escapeHtml(issue.title)}</li>`
  ).join("");

  container.innerHTML = `
    ${contentHeader("physical_ticket_management")}
    <section class="content">
      ${boxOpen("game_ticket_list", "default")}
        <div class="callout callout-info">
          <h4><i class="fa fa-info-circle"></i> ${escapeHtml(t("scope_dropped_title"))}</h4>
          <p>${escapeHtml(t("scope_dropped_game_ticket_list_body"))}</p>
        </div>
        <div class="alert alert-warning" role="alert">
          <strong>${escapeHtml(t("scope_dropped_see_linear"))}:</strong>
          <ul style="margin:8px 0 0 16px;">${list}</ul>
        </div>
      ${boxClose()}
    </section>`;
}
