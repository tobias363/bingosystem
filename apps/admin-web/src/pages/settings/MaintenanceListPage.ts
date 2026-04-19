// PR-A6 (BIN-674) — /maintenance.
// Port of legacy/unity-backend/App/Views/settings/maintenance.html.
//
// Forenklinger (§2.3):
//   - Restart-server-knapp SKJULT (ops-intern, PM-beslutning §7.2 #2).
//   - Ett maintenance-dokument (ingen list — legacy hadde én aktiv rad).

import { t } from "../../i18n/I18n.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import { getMaintenance, type MaintenanceConfig } from "../../api/admin-system-settings.js";

export function renderMaintenanceListPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("maintenance_management", "settings")}
    <section class="content">
      <div class="callout callout-warning" data-testid="settings-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("settings_placeholder_banner"))}
      </div>
      ${boxOpen("maintenance_management", "primary")}
        <div id="maintenance-body">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const host = container.querySelector<HTMLElement>("#maintenance-body")!;
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getMaintenance();
  host.innerHTML = bodyHtml(cfg);
}

function bodyHtml(cfg: MaintenanceConfig): string {
  const statusLabel = cfg.status === "active" ? t("active") : t("inactive");
  const statusBadge =
    cfg.status === "active"
      ? `<span class="label label-success">${escapeHtml(statusLabel)}</span>`
      : `<span class="label label-default">${escapeHtml(statusLabel)}</span>`;

  return `
    <div align="center">
      ${
        cfg.status === "active"
          ? `<strong><i class="fa fa-clock-o"></i> ${escapeHtml(t("maintenance_start_date"))}: ${escapeHtml(cfg.maintenance_start_date)} → ${escapeHtml(t("maintenance_end_date"))}: ${escapeHtml(cfg.maintenance_end_date)}</strong>`
          : `<button type="button" class="btn btn-block btn-danger btn-flat" disabled>${escapeHtml(statusLabel)}</button>`
      }
      <hr>
      <strong><i class="fa fa-envelope"></i> ${escapeHtml(t("maintenance_message"))}</strong>
      <p class="text-muted" data-testid="maintenance-message">${escapeHtml(cfg.message || "—")}</p>
      <hr>
      <strong><i class="fa fa-clock-o"></i> ${escapeHtml(t("show_before_minutes"))}</strong>
      <p class="text-muted" data-testid="maintenance-showbefore">${cfg.showBeforeMinutes}</p>
      <hr>
      <strong>${escapeHtml(t("maintenance_status"))}:</strong> ${statusBadge}
      <hr>
      <p>
        <a class="btn btn-warning" href="#/maintenance/edit/${encodeURIComponent(cfg.id)}" data-action="edit-maintenance">
          <i class="fa fa-edit"></i> ${escapeHtml(t("edit"))}
        </a>
      </p>
    </div>`;
}
