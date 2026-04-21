// Physical tickets route dispatcher.
//
// Scope:
//   - /addPhysicalTickets             → AddPage (batch CRUD + generate)
//   - /physicalTicketManagement       → GameTicketListPage (BIN-638 aggregate +
//                                        BIN-639 reward-all)
//   - /physical/cash-out              → CashOutPage (BIN-640 single-ticket payout)
//   - /physical/check-bingo           → CheckBingoPage (BIN-641 stamp winners)
//
// `/agent/physicalCashOut` er bevisst IKKE håndtert her — det er agent-shift-
// scoped view rendret av cash-inout/PhysicalCashoutPage.ts.

import { renderAddPage } from "./AddPage.js";
import { renderCashOutPage } from "./CashOutPage.js";
import { renderGameTicketListPage } from "./GameTicketListPage.js";
import { renderCheckBingoPage } from "./CheckBingoPage.js";

const PHYSICAL_TICKETS_ROUTES = new Set<string>([
  "/addPhysicalTickets",
  "/physicalTicketManagement",
  "/physical/cash-out",
  "/physical/check-bingo",
]);

export function isPhysicalTicketsRoute(path: string): boolean {
  return PHYSICAL_TICKETS_ROUTES.has(path);
}

export function mountPhysicalTicketsRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  switch (path) {
    case "/addPhysicalTickets":
      renderAddPage(container);
      return;
    case "/physicalTicketManagement":
      renderGameTicketListPage(container);
      return;
    case "/physical/cash-out":
      renderCashOutPage(container);
      return;
    case "/physical/check-bingo":
      renderCheckBingoPage(container);
      return;
    default:
      container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown physical-tickets route: ${path}</div></div>`;
  }
}
