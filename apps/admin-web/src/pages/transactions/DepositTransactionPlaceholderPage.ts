// PR-B4 (BIN-646) — Placeholder for depositTransaction.html.
// PM-beslutning (PR-B4-PLAN §2.6 G5): legacy `/getTransactions`-endpoint
// har ingen 1:1-port. DepositHistoryPage.ts dekker 95% av data-behovet.
// Full wallet-ledger-view følges opp i BIN-655.
//
// Denne placeholderen matcher mønsteret fra PR-B3
// (CashOutPlaceholderPage + GameTicketListPlaceholderPage).

import { t } from "../../i18n/I18n.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../amountwithdraw/shared.js";

export function renderDepositTransactionPlaceholderPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("deposit_transaction_history", "transactions_management")}
    <section class="content">
      ${boxOpen("deposit_transaction_history", "info")}
        <div class="callout callout-info" style="margin:0;">
          <h4>${escapeHtml(t("scope_dropped_title"))}</h4>
          <p>${escapeHtml(t("deposit_transaction_placeholder_body"))}</p>
          <p>
            <a href="https://linear.app/bingosystem/issue/BIN-655"
              target="_blank" rel="noopener">BIN-655</a>
            — wallet-ledger endpoint for generisk transaksjonslogg.
          </p>
          <p>
            <a href="#/deposit/history">${escapeHtml(t("deposit_history"))}</a>
            — dekker fullførte innskudd.
          </p>
        </div>
      ${boxClose()}
    </section>`;
}
