// PR-A6 (BIN-674) — /faq list.
// Port of legacy/unity-backend/App/Views/CMS/faq.html.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { DataTable } from "../../components/DataTable.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";
import { listFaq, deleteFaq, type FaqRecord } from "../../api/admin-cms.js";

export function renderFaqListPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("faq_management", "cms_management")}
    <section class="content">
      <div class="callout callout-warning" data-testid="cms-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("cms_placeholder_banner"))}
      </div>
      ${boxOpen("faq_management", "primary")}
        <div id="faq-table">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const tableHost = container.querySelector<HTMLElement>("#faq-table")!;

  async function refresh(): Promise<void> {
    tableHost.textContent = t("loading_ellipsis");
    try {
      const rows = await listFaq();
      DataTable.mount<FaqRecord>(tableHost, {
        id: "faq-datatable",
        columns: [
          { key: "queId", title: t("question_id"), render: (r) => String(r.queId) },
          { key: "question", title: t("question"), render: (r) => escapeHtml(r.question) },
          { key: "answer", title: t("answer"), render: (r) => escapeHtml(r.answer) },
          {
            key: "id",
            title: t("action"),
            align: "center",
            render: (r) => rowActions(r, () => void refresh()),
          },
        ],
        rows,
        emptyMessage: t("no_data_available_in_table"),
        toolbar: {
          extra: (host) => {
            const addBtn = document.createElement("a");
            addBtn.className = "btn btn-primary btn-sm";
            addBtn.setAttribute("data-action", "add-faq");
            addBtn.href = "#/addFAQ";
            addBtn.innerHTML = `<i class="fa fa-plus"></i> ${escapeHtml(t("add_faq"))}`;
            host.append(addBtn);
          },
        },
      });
    } catch {
      tableHost.innerHTML = `<div class="callout callout-danger">${escapeHtml(t("something_went_wrong"))}</div>`;
    }
  }

  void refresh();
}

function rowActions(row: FaqRecord, onChange: () => void): Node {
  const wrap = document.createElement("div");
  wrap.style.whiteSpace = "nowrap";

  const edit = document.createElement("a");
  edit.className = "btn btn-warning btn-xs";
  edit.setAttribute("data-action", "edit-faq");
  edit.setAttribute("data-id", row.id);
  edit.href = `#/faqEdit/${encodeURIComponent(row.id)}`;
  edit.innerHTML = `<i class="fa fa-edit"></i>`;
  edit.title = t("edit_faq");
  wrap.append(edit);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-danger btn-xs";
  del.setAttribute("data-action", "delete-faq");
  del.setAttribute("data-id", row.id);
  del.innerHTML = `<i class="fa fa-trash"></i>`;
  del.title = t("delete");
  del.style.marginLeft = "4px";
  del.addEventListener("click", () => {
    if (!window.confirm(`${t("are_you_sure")}\n\n${t("delete_player_message")}`)) return;
    void (async () => {
      try {
        await deleteFaq(row.id);
        Toast.success(t("faq_deleted_succesfully"));
        onChange();
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
  wrap.append(del);

  return wrap;
}
