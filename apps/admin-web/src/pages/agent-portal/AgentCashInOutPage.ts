// Agent-portal skeleton: Cash In/Out Management (placeholder).
// Fylles inn i oppfølger-PR (6 knapper: Add/Withdraw Unique ID + Registered
// User, Create New Unique ID, Sell Products, Shift Log Out, Today's Sales
// Report per legacy V1.0).

import { mountAgentPortalPlaceholder } from "./AgentPortalPlaceholder.js";

export function mountAgentCashInOut(container: HTMLElement): void {
  mountAgentPortalPlaceholder(container, {
    titleKey: "agent_cash_in_out_management",
    path: "/agent/cash-in-out",
    descriptionKey: "agent_cash_in_out_description",
  });
}
