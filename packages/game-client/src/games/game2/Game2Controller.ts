import { Container, Text } from "pixi.js";
import type { GameDeps, GameController } from "../registry.js";
import { registerGame } from "../registry.js";
import type { GameState } from "../../bridge/GameBridge.js";
import type { PatternWonPayload } from "@spillorama/shared-types/socket-events";
import { telemetry } from "../../telemetry/Telemetry.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { PlayScreen } from "./screens/PlayScreen.js";
import { EndScreen } from "./screens/EndScreen.js";

type Phase = "LOADING" | "LOBBY" | "PLAYING" | "ENDED";

/**
 * Game 2 (Rocket Bingo) controller.
 * Manages the full lifecycle: join room → lobby → gameplay → end → loop.
 */
class Game2Controller implements GameController {
  private deps: GameDeps;
  private root: Container;
  private phase: Phase = "LOADING";
  private currentScreen: Container | null = null;
  private lobbyScreen: LobbyScreen | null = null;
  private playScreen: PlayScreen | null = null;
  private endScreen: EndScreen | null = null;
  private myPlayerId: string | null = null;
  private actualRoomCode: string = "";
  private unsubs: (() => void)[] = [];

  constructor(deps: GameDeps) {
    this.deps = deps;
    this.root = new Container();
  }

  async start(): Promise<void> {
    const { app, socket, bridge } = this.deps;
    app.stage.addChild(this.root);

    // Connect socket
    socket.connect();

    // Wait for connection with timeout
    const connected = await new Promise<boolean>((resolve) => {
      if (socket.isConnected()) { resolve(true); return; }
      const timeout = setTimeout(() => { resolve(false); }, 10000);
      const unsub = socket.on("connectionStateChanged", (state) => {
        if (state === "connected") { unsub(); clearTimeout(timeout); resolve(true); }
      });
    });

    if (!connected) {
      this.showError("Kunne ikke koble til server");
      return;
    }

    // Track socket stability
    this.unsubs.push(
      socket.on("connectionStateChanged", (state) => {
        if (state === "reconnecting") telemetry.trackReconnect();
        if (state === "disconnected") telemetry.trackDisconnect("socket");
      }),
    );

    // Join or create room
    const joinResult = await socket.createRoom({
      hallId: this.deps.hallId,
      gameSlug: "rocket",
    });

    if (!joinResult.ok || !joinResult.data) {
      console.error("[Game2] Room join failed:", joinResult.error);
      this.showError(joinResult.error?.message || "Kunne ikke joine rom");
      return;
    }

    this.myPlayerId = joinResult.data.playerId;
    this.actualRoomCode = joinResult.data.roomCode;

    // Start bridge
    bridge.start(this.myPlayerId);
    bridge.applySnapshot(joinResult.data.snapshot);

    // Subscribe to bridge events
    this.unsubs.push(
      bridge.on("stateChanged", (state) => this.onStateChanged(state)),
      bridge.on("gameStarted", (state) => this.onGameStarted(state)),
      bridge.on("gameEnded", (state) => this.onGameEnded(state)),
      bridge.on("numberDrawn", (num, idx, state) => this.onNumberDrawn(num, idx, state)),
      bridge.on("patternWon", (result, state) => this.onPatternWon(result, state)),
    );

    // Unlock audio on first interaction
    this.root.eventMode = "static";
    this.root.on("pointerdown", () => this.deps.audio.unlock(), { once: true });

    // Auto-arm so we're ready for the next game
    await socket.armBet({
      roomCode: this.actualRoomCode,
      armed: true,
    });

    // Transition based on initial game state
    const state = bridge.getState();

    if (state.gameStatus === "RUNNING" && state.myTickets.length > 0) {
      this.transitionTo("PLAYING", state);
    } else {
      this.transitionTo("LOBBY", state);
    }
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.clearScreen();
    this.root.destroy({ children: true });
  }

  resize(width: number, height: number): void {
    if (this.phase === "LOADING") return;
    this.transitionTo(this.phase, this.deps.bridge.getState());
  }

  // ── State transitions ─────────────────────────────────────────────────

  private transitionTo(phase: Phase, state: GameState): void {
    this.phase = phase;
    this.clearScreen();

    const w = this.deps.app.app.screen.width;
    const h = this.deps.app.app.screen.height;

    switch (phase) {
      case "LOBBY":
        this.lobbyScreen = new LobbyScreen(w, h);
        this.lobbyScreen.setOnBuy((count) => this.handleBuy(count));
        this.lobbyScreen.setOnLuckyNumber((n) => this.handleLuckyNumber(n));
        this.lobbyScreen.update(state);
        this.lobbyScreen.showBuyPopup(state.entryFee || 10);
        this.setScreen(this.lobbyScreen);
        break;

      case "PLAYING":
        this.playScreen = new PlayScreen(w, h, this.deps.audio);
        this.playScreen.setOnClaim((type) => this.handleClaim(type));
        this.playScreen.buildTickets(state);
        this.playScreen.updateInfo(state);
        this.setScreen(this.playScreen);
        break;

      case "ENDED":
        this.endScreen = new EndScreen(w, h);
        this.endScreen.setOnDismiss(() => {
          this.transitionTo("LOBBY", this.deps.bridge.getState());
        });
        this.endScreen.show(state);
        this.setScreen(this.endScreen);
        break;
    }
  }

  // ── Bridge event handlers ─────────────────────────────────────────────

  private onStateChanged(state: GameState): void {
    if (this.phase === "LOBBY" && this.lobbyScreen) {
      this.lobbyScreen.update(state);
    }
    if (this.phase === "PLAYING" && this.playScreen) {
      this.playScreen.updateInfo(state);
    }
  }

  private onGameStarted(state: GameState): void {
    if (state.myTickets.length > 0) {
      this.transitionTo("PLAYING", state);
    } else {
      if (this.lobbyScreen) {
        this.lobbyScreen.update(state);
      }
    }
  }

  private onGameEnded(state: GameState): void {
    if (this.phase === "PLAYING") {
      this.transitionTo("ENDED", state);
    } else {
      this.transitionTo("LOBBY", state);
    }

    // Auto-arm for next game
    this.deps.socket.armBet({
      roomCode: this.actualRoomCode,
      armed: true,
    });
  }

  private onNumberDrawn(number: number, drawIndex: number, state: GameState): void {
    if (this.phase === "PLAYING" && this.playScreen) {
      this.playScreen.onNumberDrawn(number, drawIndex, state);
    }
  }

  private onPatternWon(result: PatternWonPayload, _state: GameState): void {
    if (this.phase === "PLAYING" && this.playScreen) {
      this.playScreen.onPatternWon(result);
    }
    telemetry.trackEvent("pattern_won", {
      patternName: result.patternName,
      isMe: result.winnerId === this.myPlayerId,
      payoutAmount: result.payoutAmount,
    });
  }

  // ── User actions ──────────────────────────────────────────────────────

  private async handleBuy(_count: number): Promise<void> {
    const result = await this.deps.socket.armBet({
      roomCode: this.actualRoomCode,
      armed: true,
    });

    if (result.ok) {
      this.lobbyScreen?.hideBuyPopup();
    } else {
      console.error("[Game2] Arm failed:", result.error);
      this.showError(result.error?.message || "Kunne ikke kjøpe billetter");
    }
  }

  private async handleLuckyNumber(number: number): Promise<void> {
    await this.deps.socket.setLuckyNumber({
      roomCode: this.actualRoomCode,
      luckyNumber: number,
    });
  }

  private async handleClaim(type: "LINE" | "BINGO"): Promise<void> {
    const result = await this.deps.socket.submitClaim({
      roomCode: this.actualRoomCode,
      type,
    });

    if (!result.ok) {
      console.error("[Game2] Claim failed:", result.error);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private setScreen(screen: Container): void {
    this.currentScreen = screen;
    this.root.addChild(screen);
  }

  private clearScreen(): void {
    if (this.currentScreen) {
      this.currentScreen.destroy({ children: true });
      this.currentScreen = null;
    }
    this.lobbyScreen = null;
    this.playScreen = null;
    this.endScreen = null;
  }

  private showError(message: string): void {
    const errorText = new Text({
      text: message,
      style: { fontFamily: "Arial", fontSize: 24, fill: 0xff4444, align: "center" },
    });
    errorText.anchor.set(0.5);
    errorText.x = this.deps.app.app.screen.width / 2;
    errorText.y = this.deps.app.app.screen.height / 2;
    this.root.addChild(errorText);
  }
}

// Register in the game registry
registerGame("rocket", (deps) => new Game2Controller(deps));
registerGame("game_2", (deps) => new Game2Controller(deps));
