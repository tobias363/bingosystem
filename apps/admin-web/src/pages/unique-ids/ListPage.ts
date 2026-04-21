// BIN-587 B4b — unique-ID list page (/uniqueIdList).
//
// Oversikt over alle papirbillett-unique-IDs for en hall, med status-filter.
// Backend: GET /api/admin/unique-ids?hallId&status&limit
//
// HALL_OPERATOR er tvunget til egen hall (backend filtrerer).

import { t } from "../../i18n/I18n.js";
import { getSession } from "../../auth/Session.js";
import { Toast } from "../../components/Toast.js";
import { DataTable } from "../../components/DataTable.js";
import { ApiError } from "../../api/client.js";
import {
  listUniqueIds,
  type PhysicalTicket,
  type PhysicalTicketStatus,
} from "../../api/admin-physical-tickets.js";
import { listHalls, type AdminHall } from "../../api/dashboard.js";
import { boxClose, boxOpen, contentHeader, escapeHtml, formatNOK } from "../physical-tickets/shared.js";

interface PageState {
  hallId: string | null;
  status: PhysicalTicketStatus | "";
  halls: AdminHall[];
  tickets: PhysicalTicket[];
}

export function renderUniqueIdListPage(container: HTMLElement): void {
  const session = getSession();
  const isAdmin = session?.role === "admin" || session?.role === "super-admin";
  const operatorHallId = !isAdmin ? session?.hall?.[0]?.id ?? null : null;

  const state: PageState = {
    hallId: operatorHallId,
    status: "",
    halls: [],
    tickets: [],
  };

  container.innerHTML = `
    ${contentHeader("unique_id_list")}
    <section class="content">
      ${boxOpen("unique_id_list", "primary")}
        <div class="row" style="margin-bottom:12px;">
          <div class="col-sm-4" id="hall-row" style="display:${isAdmin ? "block" : "none"};">
            <label class="control-label" for="filterHallId">${escapeHtml(t("select_hall"))}</label>
            <select id="filterHallId" class="form-control">
              <option value="">${escapeHtml(t("select_hall_name"))}</option>
            </select>
          </div>
          <div class="col-sm-4">
            <label class="control-label" for="filterStatus">${escapeHtml(t("ticket_status"))}</label>
            <select id="filterStatus" class="form-control">
              <option value="">${escapeHtml(t("all"))}</option>
              <option value="UNSOLD">${escapeHtml(t("ticket_status_unsold"))}</option>
              <option value="SOLD">${escapeHtml(t("ticket_status_sold"))}</option>
              <option value="VOIDED">${escapeHtml(t("ticket_status_voided"))}</option>
            </select>
          </div>
        </div>
        <div id="unique-ids-table">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const hallSelect = container.querySelector<HTMLSelectElement>("#filterHallId");
  const statusSelect = container.querySelector<HTMLSelectElement>("#filterStatus")!;
  const tableHost = container.querySelector<HTMLElement>("#unique-ids-table")!;

  void (async () => {
    if (isAdmin && hallSelect) {
      try {
        state.halls = await listHalls();
        for (const h of state.halls) {
          const opt = document.createElement("option");
          opt.value = h.id;
          opt.textContent = h.name;
          hallSelect.append(opt);
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
        Toast.error(msg);
      }
    }
    await refreshList();
  })();

  if (hallSelect) {
    hallSelect.addEventListener("change", () => {
      state.hallId = hallSelect.value || null;
      void refreshList();
    });
  }
  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value as PhysicalTicketStatus | "";
    void refreshList();
  });

  async function refreshList(): Promise<void> {
    if (!state.hallId && isAdmin) {
      tableHost.innerHTML = `<div class="callout callout-info" style="margin:0;">${escapeHtml(t("hall_scope_required"))}</div>`;
      state.tickets = [];
      return;
    }
    tableHost.textContent = t("loading_ellipsis");
    try {
      const res = await listUniqueIds({
        hallId: state.hallId ?? undefined,
        status: state.status || undefined,
        limit: 200,
      });
      state.tickets = res.tickets;
      renderTable();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
      Toast.error(msg);
      tableHost.innerHTML = "";
    }
  }

  function renderTable(): void {
    DataTable.mount<PhysicalTicket>(tableHost, {
      columns: [
        { key: "uniqueId", title: t("unique_id") },
        {
          key: "status",
          title: t("ticket_status"),
          render: (r) => escapeHtml(t("ticket_status_" + r.status.toLowerCase())),
        },
        {
          key: "priceCents",
          title: t("default_price"),
          align: "right",
          render: (r) => (r.priceCents !== null ? formatNOK(r.priceCents / 100) : "—"),
        },
        {
          key: "assignedGameId",
          title: t("game_name"),
          render: (r) => escapeHtml(r.assignedGameId ?? "—"),
        },
        {
          key: "soldAt",
          title: t("sold_at"),
          render: (r) =>
            r.soldAt ? escapeHtml(new Date(r.soldAt).toLocaleString("nb-NO")) : "—",
        },
        {
          key: "createdAt",
          title: t("date_created"),
          render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString("nb-NO")),
        },
      ],
      rows: state.tickets,
      emptyMessage: t("no_tickets"),
    });
  }
}
