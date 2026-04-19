// PR-A5 (BIN-663) — /adminUser/editRole/:id stub.
// Replaced in commit 4 (role bolk) with the full static permission-matrix
// + role-assignment write UI. Stub here so the commit-2 dispatcher compiles.

import { t } from "../../i18n/I18n.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

export function renderAdminEditRolePage(container: HTMLElement, _userId: string | null): void {
  container.innerHTML = `
    ${contentHeader("assign_role_to_admin", "admin_management")}
    <section class="content">
      ${boxOpen("assign_role_to_admin", "warning")}
        <div class="callout callout-warning">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;
}
