// PR-A5 (BIN-663) — /agent list stub.
// Replaced in commit 3 with live AgentListPage (admin-agents.ts wrapper).
// Intermediate commit 2 ships a placeholder so dispatcher-compile succeeds.

import { t } from "../../i18n/I18n.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

export function renderAgentListPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("agent_management", "agent_management")}
    <section class="content">
      ${boxOpen("agent_management", "warning")}
        <div class="callout callout-warning">
          ${escapeHtml(t("loading_ellipsis"))}
        </div>
      ${boxClose()}
    </section>`;
}
