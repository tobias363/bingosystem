// PR-B4 (BIN-646) — TransactionManagement route dispatcher.
//
// Routes:
//   /deposit/requests              → deposit pending queue
//   /deposit/history               → deposit history (accepted + rejected)
//   /deposit/transaction           → placeholder (BIN-655)

import { renderDepositRequestsPage } from "./DepositRequestsPage.js";
import { renderDepositHistoryPage } from "./DepositHistoryPage.js";
import { renderDepositTransactionPlaceholderPage } from "./DepositTransactionPlaceholderPage.js";

const TRANSACTION_ROUTES = new Set<string>([
  "/deposit/requests",
  "/deposit/history",
  "/deposit/transaction",
]);

export function isTransactionRoute(path: string): boolean {
  return TRANSACTION_ROUTES.has(path);
}

export function mountTransactionRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  switch (path) {
    case "/deposit/requests":
      renderDepositRequestsPage(container);
      return;
    case "/deposit/history":
      renderDepositHistoryPage(container);
      return;
    case "/deposit/transaction":
      renderDepositTransactionPlaceholderPage(container);
      return;
    default:
      container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown transaction route: ${path}</div></div>`;
  }
}
