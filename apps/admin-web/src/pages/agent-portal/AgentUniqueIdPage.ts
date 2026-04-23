// Agent-portal skeleton: Unique ID Management (placeholder).
// Fylles inn i oppfølger-PR (Generate Unique ID, List, Details,
// Re-generate, Withdraw per legacy V1.0).

import { mountAgentPortalPlaceholder } from "./AgentPortalPlaceholder.js";

export function mountAgentUniqueId(container: HTMLElement): void {
  mountAgentPortalPlaceholder(container, {
    titleKey: "agent_unique_id_management",
    path: "/agent/unique-id",
    descriptionKey: "agent_unique_id_description",
  });
}
