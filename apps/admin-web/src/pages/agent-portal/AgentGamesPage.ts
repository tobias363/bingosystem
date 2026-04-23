// Agent-portal skeleton: Game Management (placeholder).
// Fylles inn i oppfølger-PR (Next Game-panel, Start Next Game,
// PAUSE/Check Bingo-flyt per legacy V1.0).

import { mountAgentPortalPlaceholder } from "./AgentPortalPlaceholder.js";

export function mountAgentGames(container: HTMLElement): void {
  mountAgentPortalPlaceholder(container, {
    titleKey: "agent_game_management",
    path: "/agent/games",
    descriptionKey: "agent_games_description",
  });
}
