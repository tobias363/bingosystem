// PR-A5 (BIN-663) — /agent/{add,edit/:id} stub.
// Replaced in commit 3 with live AgentFormPage (admin-agents.ts wrapper).

import { t } from "../../i18n/I18n.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

export function renderAgentFormPage(container: HTMLElement, _editId: string | null): void {
  container.innerHTML = `
    ${contentHeader("agent_management", "agent_management")}
    <section class="content">
      ${boxOpen("agent_management", "warning")}
        <div class="callout callout-warning">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;
}
