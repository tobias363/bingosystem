// BIN-629: Login-history tab — wired to
// GET /api/admin/players/:id/login-history.
//
// Viser tidligere innloggingsforsøk (success + failed). Kilden er
// `app_audit_log` (auth.login / auth.login.failed). Cursor-paginert med
// opaque base64url-offset; vi hopper frem mens `nextCursor` er satt.

import { t } from "../../../i18n/I18n.js";
import { DataTable } from "../../../components/DataTable.js";
import { Toast } from "../../../components/Toast.js";
import { ApiError } from "../../../api/client.js";
import {
  listPlayerLoginHistory,
  type LoginHistoryEntry,
} from "../../../api/admin-player-activity.js";
import { escapeHtml, formatDateTime } from "../shared.js";

const PAGE_SIZE = 50;

export function mountLoginHistoryTab(host: HTMLElement, userId: string): void {
  host.innerHTML = `
    <div id="login-history-body">
      <p class="text-muted">${escapeHtml(t("loading_ellipsis"))}</p>
    </div>
    <div id="login-history-pager" style="margin-top:12px;"></div>`;

  const body = host.querySelector<HTMLElement>("#login-history-body")!;
  const pager = host.querySelector<HTMLElement>("#login-history-pager")!;

  const rows: LoginHistoryEntry[] = [];
  let nextCursor: string | null = null;
  let loading = false;

  function stateLabel(entry: LoginHistoryEntry): string {
    return entry.success ? t("login_success") : t("login_failed");
  }

  function stateBadge(entry: LoginHistoryEntry): string {
    const cls = entry.success ? "label-success" : "label-danger";
    return `<span class="label ${cls}">${escapeHtml(stateLabel(entry))}</span>`;
  }

  function describe(entry: LoginHistoryEntry): string {
    const parts: string[] = [];
    if (entry.ipAddress) parts.push(`IP: ${entry.ipAddress}`);
    if (entry.userAgent) parts.push(entry.userAgent);
    if (!entry.success && entry.failureReason) {
      parts.push(`${t("reason")}: ${entry.failureReason}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  function renderTable(): void {
    if (rows.length === 0) {
      body.innerHTML = `<p class="text-muted">${escapeHtml(t("no_data_available_in_table"))}</p>`;
      return;
    }
    DataTable.mount<LoginHistoryEntry>(body, {
      className: "table-striped",
      columns: [
        {
          key: "timestamp",
          title: t("date_time"),
          render: (r) => escapeHtml(formatDateTime(r.timestamp)),
        },
        {
          key: "success",
          title: t("state"),
          render: (r) => stateBadge(r),
        },
        {
          key: "ipAddress",
          title: t("description"),
          render: (r) => escapeHtml(describe(r)),
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
      <button type="button" class="btn btn-default" id="login-history-load-more">
        ${escapeHtml(t("load_more"))}
      </button>`;
    pager
      .querySelector<HTMLButtonElement>("#login-history-load-more")
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
      const result = await listPlayerLoginHistory(userId, {
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
