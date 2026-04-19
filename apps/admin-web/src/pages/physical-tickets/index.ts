// PR-B3 (BIN-613) — Physical tickets route dispatcher.
//
// Scope:
//   - /addPhysicalTickets             → AddPage (batch CRUD + generate)
//   - /agent/physicalCashOut          → (owned by PR-B1 cash-inout dispatcher, shift-scoped)
//   - /physicalTicketManagement       → GameTicketListPlaceholderPage (placeholder)
//   - /physical/cash-out              → CashOutPlaceholderPage (placeholder)
//
// `/agent/physicalCashOut` is intentionally NOT handled here — it's the agent
// shift-scoped view rendered by cash-inout/PhysicalCashoutPage.ts. The admin
// cross-shift aggregate view lives at `/physical/cash-out` and is a
// placeholder until BIN-638/640/641 land.

import { renderAddPage } from "./AddPage.js";
import { renderCashOutPlaceholderPage } from "./CashOutPlaceholderPage.js";
import { renderGameTicketListPlaceholderPage } from "./GameTicketListPlaceholderPage.js";

const PHYSICAL_TICKETS_ROUTES = new Set<string>([
  "/addPhysicalTickets",
  "/physicalTicketManagement",
  "/physical/cash-out",
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
      renderGameTicketListPlaceholderPage(container);
      return;
    case "/physical/cash-out":
      renderCashOutPlaceholderPage(container);
      return;
    default:
      container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown physical-tickets route: ${path}</div></div>`;
  }
}
