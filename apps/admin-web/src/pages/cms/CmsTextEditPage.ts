// PR-A6 (BIN-674) — CMS-tekst-edit (gjenbruk for 5 sider).
//
// Port of:
//   - CMS/termsofservice.html
//   - CMS/support.html
//   - CMS/aboutus.html
//   - CMS/ResponsibleGameing.html  (regulatorisk — LOCKED i PR-A6)
//   - CMS/LinksofOtherAgencies.html
//
// Regulatorisk-gate (PM-beslutning PR-A6 §7.2 #1):
// Spillvett-tekst (responsible_gaming) kan **ikke redigeres** via UI før
// BIN-A6-SPILLVETT-AUDIT backend lander (AuditLog + versjon-historikk).
// Edit-knapp rendres disabled + tydelig gap-banner vises.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import {
  getCmsText,
  setCmsText,
  type CmsTextKey,
} from "../../api/admin-cms.js";

/** Spillvett-tekst er regulatorisk-låst i PR-A6 (§11 pengespillforskriften). */
const REGULATORY_LOCKED_KEYS: readonly CmsTextKey[] = ["responsible_gaming"];

export function renderCmsTextEditPage(container: HTMLElement, key: CmsTextKey): void {
  const isLocked = REGULATORY_LOCKED_KEYS.includes(key);
  const labelKey = key; // i18n keys matcher CmsTextKey-enum

  container.innerHTML = `
    ${contentHeader(labelKey, "cms_management")}
    <section class="content">
      ${
        isLocked
          ? `<div class="callout callout-danger" data-testid="cms-regulatory-lock-banner">
              <i class="fa fa-lock"></i>
              <strong>${escapeHtml(t("cms_spillvett_audit_required_title"))}</strong>
              <p>${escapeHtml(t("cms_spillvett_audit_required_body"))}</p>
            </div>`
          : `<div class="callout callout-warning" data-testid="cms-placeholder-banner">
              <i class="fa fa-clock-o"></i>
              ${escapeHtml(t("cms_placeholder_banner"))}
            </div>`
      }
      ${boxOpen(labelKey, "primary")}
        <form id="cms-text-form" class="form-horizontal" data-testid="cms-text-form">
          <div class="form-group">
            <label class="col-sm-2 control-label" for="cms-body">${escapeHtml(t(labelKey))}</label>
            <div class="col-sm-10">
              <textarea
                id="cms-body"
                name="body"
                class="form-control"
                rows="12"
                data-testid="cms-body-textarea"
                ${isLocked ? "disabled" : ""}
                placeholder="${escapeHtml(t("enter") + " " + t(labelKey))}"></textarea>
            </div>
          </div>
          <div class="form-group">
            <div class="col-sm-offset-2 col-sm-10">
              <button type="submit"
                      class="btn btn-success"
                      data-action="save-cms-text"
                      ${isLocked ? "disabled" : ""}>
                <i class="fa fa-save"></i> ${escapeHtml(t("submit"))}
              </button>
              <a class="btn btn-default" href="#/cms">${escapeHtml(t("cancel"))}</a>
            </div>
          </div>
        </form>
      ${boxClose()}
    </section>`;

  const form = container.querySelector<HTMLFormElement>("#cms-text-form")!;
  const textarea = container.querySelector<HTMLTextAreaElement>("#cms-body")!;

  void (async () => {
    const record = await getCmsText(key);
    textarea.value = record.body;
  })();

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (isLocked) {
      Toast.error(t("cms_spillvett_audit_required_body"));
      return;
    }
    void (async () => {
      try {
        await setCmsText(key, textarea.value);
        Toast.success(t("success"));
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
}
