// PR-A6 (BIN-674) — /maintenance/edit/:id.
// Port of legacy/unity-backend/App/Views/settings/maintenanceEdit.html.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import {
  getMaintenance,
  updateMaintenance,
  type MaintenanceConfig,
} from "../../api/admin-system-settings.js";

export function renderMaintenanceFormPage(container: HTMLElement, _id: string): void {
  container.innerHTML = `
    ${contentHeader("maintenance_management", "settings")}
    <section class="content">
      <div class="callout callout-warning" data-testid="settings-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("settings_placeholder_banner"))}
      </div>
      ${boxOpen("maintenance_management", "primary")}
        <div id="maintenance-form-host">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const host = container.querySelector<HTMLElement>("#maintenance-form-host")!;
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getMaintenance();
  host.innerHTML = `
    <form id="maintenance-form" class="form-horizontal" data-testid="maintenance-form">
      <div class="form-group">
        <label class="col-sm-3 control-label" for="mf-message">${escapeHtml(t("maintenance_message"))}</label>
        <div class="col-sm-9">
          <textarea id="mf-message" name="message" class="form-control" rows="4">${escapeHtml(cfg.message)}</textarea>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="mf-show-before">${escapeHtml(t("show_before_minutes"))}</label>
        <div class="col-sm-9">
          <input type="number" id="mf-show-before" name="showBeforeMinutes"
            class="form-control" min="0"
            value="${escapeHtml(String(cfg.showBeforeMinutes))}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="mf-start">${escapeHtml(t("maintenance_start_date"))}</label>
        <div class="col-sm-9">
          <input type="datetime-local" id="mf-start" name="maintenance_start_date"
            class="form-control" value="${escapeHtml(cfg.maintenance_start_date)}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="mf-end">${escapeHtml(t("maintenance_end_date"))}</label>
        <div class="col-sm-9">
          <input type="datetime-local" id="mf-end" name="maintenance_end_date"
            class="form-control" value="${escapeHtml(cfg.maintenance_end_date)}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="mf-status">${escapeHtml(t("maintenance_status"))}</label>
        <div class="col-sm-9">
          <select id="mf-status" name="status" class="form-control">
            <option value="active"${cfg.status === "active" ? " selected" : ""}>${escapeHtml(t("active"))}</option>
            <option value="inactive"${cfg.status === "inactive" ? " selected" : ""}>${escapeHtml(t("inactive"))}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <div class="col-sm-offset-3 col-sm-9">
          <button type="submit" class="btn btn-success" data-action="save-maintenance">
            <i class="fa fa-save"></i> ${escapeHtml(t("submit"))}
          </button>
          <a class="btn btn-default" href="#/maintenance">${escapeHtml(t("cancel"))}</a>
        </div>
      </div>
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#maintenance-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit(form);
  });
}

async function submit(form: HTMLFormElement): Promise<void> {
  const patch: Partial<MaintenanceConfig> = {
    message: (form.querySelector<HTMLTextAreaElement>("#mf-message")!).value.trim(),
    showBeforeMinutes: Number((form.querySelector<HTMLInputElement>("#mf-show-before")!).value),
    maintenance_start_date: (form.querySelector<HTMLInputElement>("#mf-start")!).value.trim(),
    maintenance_end_date: (form.querySelector<HTMLInputElement>("#mf-end")!).value.trim(),
    status: (form.querySelector<HTMLSelectElement>("#mf-status")!).value as "active" | "inactive",
  };

  try {
    await updateMaintenance(patch);
    Toast.success(t("success"));
    window.location.hash = "#/maintenance";
  } catch {
    Toast.error(t("something_went_wrong"));
  }
}
