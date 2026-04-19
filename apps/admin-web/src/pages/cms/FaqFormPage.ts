// PR-A6 (BIN-674) — /addFAQ + /faqEdit/:id.
// Port of legacy/unity-backend/App/Views/CMS/addFAQ.html.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import {
  getFaq,
  createFaq,
  updateFaq,
  type FaqRecord,
} from "../../api/admin-cms.js";

export function renderFaqFormPage(container: HTMLElement, editId: string | null): void {
  const isEdit = editId !== null;
  const titleKey = isEdit ? "edit_faq" : "add_faq";

  container.innerHTML = `
    ${contentHeader(titleKey, "cms_management")}
    <section class="content">
      <div class="callout callout-warning" data-testid="cms-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("cms_placeholder_banner"))}
      </div>
      ${boxOpen(titleKey, "primary")}
        <div id="faq-form-host">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const host = container.querySelector<HTMLElement>("#faq-form-host")!;
  void mount(host, editId);
}

async function mount(host: HTMLElement, editId: string | null): Promise<void> {
  let existing: FaqRecord | null = null;
  if (editId) {
    existing = await getFaq(editId);
    if (!existing) {
      host.innerHTML = `<div class="callout callout-danger">${escapeHtml(t("something_went_wrong"))}</div>`;
      return;
    }
  }

  host.innerHTML = `
    <form id="faq-form" class="form-horizontal" data-testid="faq-form">
      <div class="form-group">
        <label class="col-sm-2 control-label" for="ff-question">${escapeHtml(t("question"))}</label>
        <div class="col-sm-10">
          <input type="text" id="ff-question" name="question" class="form-control" required
            value="${escapeHtml(existing?.question ?? "")}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-2 control-label" for="ff-answer">${escapeHtml(t("answer"))}</label>
        <div class="col-sm-10">
          <textarea id="ff-answer" name="answer" class="form-control" rows="6" required>${escapeHtml(existing?.answer ?? "")}</textarea>
        </div>
      </div>
      <div class="form-group">
        <div class="col-sm-offset-2 col-sm-10">
          <button type="submit" class="btn btn-success" data-action="save-faq">
            <i class="fa fa-save"></i> ${escapeHtml(t("submit"))}
          </button>
          <a class="btn btn-default" href="#/faq">${escapeHtml(t("cancel"))}</a>
        </div>
      </div>
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#faq-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit(form, existing);
  });
}

async function submit(form: HTMLFormElement, existing: FaqRecord | null): Promise<void> {
  const question = (form.querySelector<HTMLInputElement>("#ff-question")!).value.trim();
  const answer = (form.querySelector<HTMLTextAreaElement>("#ff-answer")!).value.trim();

  if (!question || !answer) {
    Toast.error(t("all_fields_are_required"));
    return;
  }

  try {
    if (existing) {
      await updateFaq(existing.id, { question, answer });
    } else {
      await createFaq({ question, answer });
    }
    Toast.success(t("success"));
    window.location.hash = "#/faq";
  } catch {
    Toast.error(t("something_went_wrong"));
  }
}
