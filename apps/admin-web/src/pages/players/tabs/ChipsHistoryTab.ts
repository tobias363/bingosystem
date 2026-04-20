// BIN-630: Chips-history tab — wired to
// GET /api/admin/players/:id/chips-history.
//
// Viser paginert sjetong-historikk (wallet-transaksjoner med `balanceAfter`
// per rad). Cursor-paginert (opaque base64url offset). `type` styrer fortegn
// i presentasjonen (CREDIT/TOPUP/TRANSFER_IN = pluss, DEBIT/WITHDRAWAL/
// TRANSFER_OUT = minus).

import { t } from "../../../i18n/I18n.js";
import { DataTable } from "../../../components/DataTable.js";
import { Toast } from "../../../components/Toast.js";
import { ApiError } from "../../../api/client.js";
import {
  listPlayerChipsHistory,
  type ChipsHistoryEntry,
} from "../../../api/admin-player-activity.js";
import { escapeHtml, formatDateTime, formatNOK } from "../shared.js";

const PAGE_SIZE = 50;
const INFLOW_TYPES = new Set<ChipsHistoryEntry["type"]>(["CREDIT", "TOPUP", "TRANSFER_IN"]);

export function mountChipsHistoryTab(host: HTMLElement, userId: string): void {
  host.innerHTML = `
    <div id="chips-history-body">
      <p class="text-muted">${escapeHtml(t("loading_ellipsis"))}</p>
    </div>
    <div id="chips-history-pager" style="margin-top:12px;"></div>`;

  const body = host.querySelector<HTMLElement>("#chips-history-body")!;
  const pager = host.querySelector<HTMLElement>("#chips-history-pager")!;

  const rows: ChipsHistoryEntry[] = [];
  let nextCursor: string | null = null;
  let loading = false;

  function signedAmount(entry: ChipsHistoryEntry): string {
    const sign = INFLOW_TYPES.has(entry.type) ? "+" : "-";
    return `${sign}${formatNOK(entry.amount)} kr`;
  }

  function renderTable(): void {
    if (rows.length === 0) {
      body.innerHTML = `<p class="text-muted">${escapeHtml(t("no_data_available_in_table"))}</p>`;
      return;
    }
    DataTable.mount<ChipsHistoryEntry>(body, {
      className: "table-striped",
      columns: [
        {
          key: "timestamp",
          title: t("date_time"),
          render: (r) => escapeHtml(formatDateTime(r.timestamp)),
        },
        {
          key: "type",
          title: t("transaction_type"),
          render: (r) => escapeHtml(r.type),
        },
        {
          key: "amount",
          title: t("amount"),
          align: "right",
          render: (r) => escapeHtml(signedAmount(r)),
        },
        {
          key: "balanceAfter",
          title: t("balance_after"),
          align: "right",
          render: (r) => `${escapeHtml(formatNOK(r.balanceAfter))} kr`,
        },
        {
          key: "description",
          title: t("description"),
          render: (r) => escapeHtml(r.description || "—"),
        },
      ],
      rows,
      emptyMessage: t("no_data_available_in_table"),
    });
  }

  function renderPager(): void {
    if (!nextCursor) {
      pager.innerHTML = "";
      return;
    }
    pager.innerHTML = `
      <button type="button" class="btn btn-default" id="chips-history-load-more">
        ${escapeHtml(t("load_more"))}
      </button>`;
    pager
      .querySelector<HTMLButtonElement>("#chips-history-load-more")
      ?.addEventListener("click", () => {
        void loadPage(nextCursor);
      });
  }

  async function loadPage(cursor: string | null): Promise<void> {
    if (loading) return;
    loading = true;
    const isFirstPage = rows.length === 0;
    if (!isFirstPage) {
      pager.innerHTML = `<p class="text-muted">${escapeHtml(t("loading_ellipsis"))}</p>`;
    }
    try {
      const result = await listPlayerChipsHistory(userId, {
        limit: PAGE_SIZE,
        cursor: cursor ?? undefined,
      });
      rows.push(...result.items);
      nextCursor = result.nextCursor;
      renderTable();
      renderPager();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
      Toast.error(msg);
      if (isFirstPage) {
        body.innerHTML = `<p class="text-danger">${escapeHtml(msg)}</p>`;
      } else {
        pager.innerHTML = `<p class="text-danger">${escapeHtml(msg)}</p>`;
      }
    } finally {
      loading = false;
    }
  }

  void loadPage(null);
}
