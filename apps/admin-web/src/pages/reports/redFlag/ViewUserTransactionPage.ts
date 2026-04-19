// PR-A4a (BIN-645) — /redFlagCategory/userTransaction/:userId.
//
// Legacy: report/viewUserTransaction.html (181 linjer). Full transaksjons-
// historie for en flagget bruker — uses existing
// /api/admin/players/:id/transactions (no gap).

import { DataTable } from "../../../components/DataTable.js";
import { t } from "../../../i18n/I18n.js";
import {
  listPlayerTransactions,
  type WalletTransaction,
} from "../../../api/admin-player-activity.js";
import {
  formatCurrency,
  formatDateTime,
  renderReportShell,
} from "../shared/reportShell.js";
import { escapeHtml } from "../../games/common/escape.js";

export async function renderViewUserTransactionPage(
  container: HTMLElement,
  userId: string
): Promise<void> {
  const tableHostId = "user-transaction-table";
  container.innerHTML = renderReportShell({
    title: t("user_transactions"),
    subtitle: userId,
    tableHostId,
  });

  const host = container.querySelector<HTMLElement>(`#${tableHostId}`);
  if (!host) return;

  try {
    const res = await listPlayerTransactions(userId, 500);
    DataTable.mount<WalletTransaction>(host, {
      rows: res.transactions,
      emptyMessage: t("no_data_available_in_table"),
      className: "user-transactions",
      csvExport: { filename: `user-transactions-${userId}` },
      columns: [
        {
          key: "createdAt",
          title: t("created_at"),
          render: (r) => formatDateTime(r.createdAt),
        },
        { key: "type", title: t("type") },
        {
          key: "amount",
          title: t("amount"),
          align: "right",
          render: (r) => formatCurrency(r.amount),
        },
        { key: "description", title: t("description") },
        { key: "externalRef", title: t("reference") },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    host.innerHTML = `<div class="alert alert-danger">${escapeHtml(msg)}</div>`;
  }
}
