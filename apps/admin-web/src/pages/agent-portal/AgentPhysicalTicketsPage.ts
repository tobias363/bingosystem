// Agent-portal skeleton: Add Physical Ticket (placeholder).
// Fylles inn i oppfølger-PR (Register More/Sold Tickets-flyt per legacy V2.0).

import { mountAgentPortalPlaceholder } from "./AgentPortalPlaceholder.js";

export function mountAgentPhysicalTickets(container: HTMLElement): void {
  mountAgentPortalPlaceholder(container, {
    titleKey: "add_physical_tickets",
    path: "/agent/physical-tickets",
    descriptionKey: "agent_physical_tickets_description",
  });
}
