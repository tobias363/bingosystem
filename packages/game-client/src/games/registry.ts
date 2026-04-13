import type { GameApp } from "../core/GameApp.js";
import type { GameBridge } from "../bridge/GameBridge.js";
import type { SpilloramaSocket } from "../net/SpilloramaSocket.js";
import type { AudioManager } from "../audio/AudioManager.js";

export interface GameController {
  start(): Promise<void>;
  destroy(): void;
}

export type GameFactory = (deps: GameDeps) => GameController;

export interface GameDeps {
  app: GameApp;
  bridge: GameBridge;
  socket: SpilloramaSocket;
  audio: AudioManager;
  roomCode: string;
  hallId: string;
}

const registry = new Map<string, GameFactory>();

export function registerGame(slug: string, factory: GameFactory): void {
  registry.set(slug, factory);
}

export function createGame(slug: string, deps: GameDeps): GameController | null {
  const factory = registry.get(slug);
  if (!factory) return null;
  return factory(deps);
}

// Game registrations (side-effect imports)
import("./game2/Game2Controller.js").catch(() => {});
