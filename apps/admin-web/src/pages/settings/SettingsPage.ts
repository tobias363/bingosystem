// PR-A6 (BIN-674) — /settings.
// Port of legacy/unity-backend/App/Views/settings/settings.html (640 linjer).
//
// Scope-kutt (§2.3 design-avvik):
//   - Screen-saver image upload SKJULT (kiosk-feature, ikke pilot-kritisk).
//   - Spiller-tak (daily/monthly spending) READ-ONLY m/ info-banner
//     (per-hall Spillvett tar presedens).
//
// Backend-gap: BIN-A6-SETTINGS — localStorage-fallback.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import {
  getGlobalSettings,
  updateGlobalSettings,
  type GlobalAppSettings,
} from "../../api/admin-system-settings.js";

export function renderSettingsPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("settings", "settings")}
    <section class="content">
      <div class="callout callout-warning" data-testid="settings-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("settings_placeholder_banner"))}
      </div>
      ${boxOpen("settings", "primary")}
        <div id="settings-form-host">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const host = container.querySelector<HTMLElement>("#settings-form-host")!;
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const current = await getGlobalSettings();

  host.innerHTML = `
    <form id="settings-form" class="form-horizontal" data-testid="settings-form">
      <h4>${escapeHtml(t("android_version"))} / ${escapeHtml(t("ios_version"))} / ${escapeHtml(t("webgl_version"))} / ${escapeHtml(t("windows_version"))}</h4>
      ${versionRow("android_version", t("android_version"), current.android_version)}
      ${versionRow("android_store_link", t("android_store_link"), current.android_store_link, "text")}
      ${versionRow("ios_version", t("ios_version"), current.ios_version)}
      ${versionRow("ios_store_link", t("ios_store_link"), current.ios_store_link, "text")}
      ${versionRow("wind_linux_version", t("windows_version"), current.wind_linux_version)}
      ${versionRow("windows_store_link", t("windows_store_link"), current.windows_store_link, "text")}
      ${versionRow("webgl_version", t("webgl_version"), current.webgl_version)}
      ${versionRow("webgl_store_link", t("webgl_store_link"), current.webgl_store_link, "text")}

      <div class="form-group">
        <label class="col-sm-3 control-label" for="sf-disable-store-link">${escapeHtml(t("disable_store_link"))}</label>
        <div class="col-sm-6">
          <select id="sf-disable-store-link" name="disable_store_link" class="form-control">
            <option value="Yes"${current.disable_store_link === "Yes" ? " selected" : ""}>${escapeHtml(t("yes"))}</option>
            <option value="No"${current.disable_store_link === "No" ? " selected" : ""}>${escapeHtml(t("no"))}</option>
          </select>
        </div>
      </div>

      <hr>
      <div class="callout callout-info" data-testid="per-hall-spillvett-override-info">
        <i class="fa fa-info-circle"></i>
        ${escapeHtml(t("per_hall_spillvett_override_info"))}
      </div>

      <div class="form-group">
        <label class="col-sm-3 control-label" for="sf-daily">${escapeHtml(t("daily_spending"))}</label>
        <div class="col-sm-6">
          <input type="number"
                 id="sf-daily"
                 name="daily_spending"
                 class="form-control"
                 data-testid="sf-daily-readonly"
                 readonly
                 value="${escapeHtml(String(current.daily_spending))}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="sf-monthly">${escapeHtml(t("monthly_spending"))}</label>
        <div class="col-sm-6">
          <input type="number"
                 id="sf-monthly"
                 name="monthly_spending"
                 class="form-control"
                 data-testid="sf-monthly-readonly"
                 readonly
                 value="${escapeHtml(String(current.monthly_spending))}">
        </div>
      </div>

      <hr>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="sf-screen-saver">${escapeHtml(t("screen_saver"))}</label>
        <div class="col-sm-6">
          <input type="checkbox"
                 id="sf-screen-saver"
                 name="screenSaver"
                 data-testid="sf-screensaver"
                 ${current.screenSaver ? "checked" : ""}>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="sf-screen-saver-time">${escapeHtml(t("screen_saver_time"))}</label>
        <div class="col-sm-6">
          <select id="sf-screen-saver-time" name="screenSaverTime" class="form-control">
            ${Array.from({ length: 20 }, (_, i) => i + 1)
              .map(
                (i) =>
                  `<option value="${i}"${current.screenSaverTime === i ? " selected" : ""}>${i} ${escapeHtml(t("minutes"))}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="form-group">
        <div class="col-sm-offset-3 col-sm-6">
          <button type="submit" class="btn btn-success" data-action="save-settings">
            <i class="fa fa-save"></i> ${escapeHtml(t("submit"))}
          </button>
        </div>
      </div>
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#settings-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit(form, current);
  });
}

function versionRow(name: string, label: string, value: string, type: "text" | "number" = "text"): string {
  return `
    <div class="form-group">
      <label class="col-sm-3 control-label" for="sf-${name}">${escapeHtml(label)}</label>
      <div class="col-sm-6">
        <input type="${type}"
               id="sf-${name}"
               name="${name}"
               class="form-control"
               value="${escapeHtml(value)}">
      </div>
    </div>`;
}

async function submit(form: HTMLFormElement, current: GlobalAppSettings): Promise<void> {
  const patch: Partial<GlobalAppSettings> = {
    android_version: (form.querySelector<HTMLInputElement>("#sf-android_version")!).value.trim(),
    android_store_link: (form.querySelector<HTMLInputElement>("#sf-android_store_link")!).value.trim(),
    ios_version: (form.querySelector<HTMLInputElement>("#sf-ios_version")!).value.trim(),
    ios_store_link: (form.querySelector<HTMLInputElement>("#sf-ios_store_link")!).value.trim(),
    wind_linux_version: (form.querySelector<HTMLInputElement>("#sf-wind_linux_version")!).value.trim(),
    windows_store_link: (form.querySelector<HTMLInputElement>("#sf-windows_store_link")!).value.trim(),
    webgl_version: (form.querySelector<HTMLInputElement>("#sf-webgl_version")!).value.trim(),
    webgl_store_link: (form.querySelector<HTMLInputElement>("#sf-webgl_store_link")!).value.trim(),
    disable_store_link: (form.querySelector<HTMLSelectElement>("#sf-disable-store-link")!).value as "Yes" | "No",
    screenSaver: (form.querySelector<HTMLInputElement>("#sf-screen-saver")!).checked,
    screenSaverTime: Number((form.querySelector<HTMLSelectElement>("#sf-screen-saver-time")!).value),
    // daily_spending and monthly_spending preserved read-only
    daily_spending: current.daily_spending,
    monthly_spending: current.monthly_spending,
  };

  try {
    await updateGlobalSettings(patch);
    Toast.success(t("success"));
  } catch {
    Toast.error(t("something_went_wrong"));
  }
}
