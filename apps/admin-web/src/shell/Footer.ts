import { t } from "../i18n/I18n.js";
import { escapeHtml } from "../utils/escapeHtml.js";

const VERSION = "0.1.0-shell";

export function renderFooter(container: HTMLElement): void {
  container.innerHTML = "";
  const footer = document.createElement("footer");
  footer.className = "main-footer";
  footer.innerHTML = `
    <div class="pull-right hidden-xs">
      <b>${escapeHtml(t("version"))}</b> ${VERSION}
    </div>
    <strong>${escapeHtml(t("copyright_line"))} &copy; ${new Date().getFullYear()} Spillorama.</strong> ${escapeHtml(t("all_rights_reserved"))}
  `;
  container.append(footer);
}
