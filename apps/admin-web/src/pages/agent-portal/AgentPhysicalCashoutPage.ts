// Agent-portal skeleton: Physical Cashout (placeholder).
// Fylles inn i oppfølger-PR (per dato + sub-game, Reward All, per-ticket
// Rewarded-status per legacy V1.0).

import { mountAgentPortalPlaceholder } from "./AgentPortalPlaceholder.js";

export function mountAgentPhysicalCashout(container: HTMLElement): void {
  mountAgentPortalPlaceholder(container, {
    titleKey: "agent_physical_cashout",
    path: "/agent/physical-cashout",
    descriptionKey: "agent_physical_cashout_description",
  });
}
