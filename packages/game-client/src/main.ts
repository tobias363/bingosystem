import { GameApp, type GameMountConfig } from "./core/GameApp.js";

let currentApp: GameApp | null = null;

/**
 * Mount the web game client into a container element.
 * Called by the web shell (lobby.js) when a player selects a game.
 */
export async function mountGame(
  container: HTMLElement,
  config: GameMountConfig,
): Promise<void> {
  // Tear down previous game if any
  if (currentApp) {
    currentApp.destroy();
    currentApp = null;
  }

  currentApp = new GameApp();
  await currentApp.init(container, config);
}

/**
 * Unmount the current game and clean up resources.
 * Called by the web shell when navigating back to lobby.
 */
export function unmountGame(): void {
  if (currentApp) {
    currentApp.destroy();
    currentApp = null;
  }
}

// Expose on window for dynamic import from lobby.js
(window as unknown as Record<string, unknown>).__spilloramaGameClient = {
  mountGame,
  unmountGame,
};

// Dev mode: auto-mount when running standalone via `vite dev`
if (import.meta.env.DEV) {
  const container = document.getElementById("game-container");
  if (container) {
    mountGame(container, {
      gameSlug: "game_2",
      accessToken: "dev-token",
      hallId: "dev-hall",
      serverUrl: "http://localhost:4000",
    });
  }
}
