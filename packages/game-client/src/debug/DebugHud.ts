/**
 * Real-time HUD overlay (Component 2).
 *
 * Floating panel that re-renders every animation frame (rate-limited to
 * 4Hz so we don't pile onto the game's own paint cost). Shows the
 * pieces an operator wants at a glance during an incident:
 *
 *   - Room code + game-status (NONE / WAITING / RUNNING / ENDED)
 *   - Truncated player/wallet ids (first 8 chars only — never full PII)
 *   - Connection state + measured latency
 *   - Auto-draw tick — last tick wall-clock + drawsTriggered counter
 *   - drawnCount / maxDraws
 *   - prizePool
 *   - my ticket count + my marks count
 *   - WebSocket events/sec (sent + received) from NetworkTap
 *   - performance.memory if Chrome
 *   - FPS counter
 *
 * Toggle via Ctrl+Shift+D or F8. Drag by the title bar. Position
 * persisted to localStorage (`spillorama.debug.hud.pos`) so the
 * operator's preferred corner sticks across reloads.
 *
 * Reused styling cue: PerfHud uses red border, the debug HUD uses gold
 * (#d4af37) to clearly distinguish them when both are open.
 */

import type { NetworkTap } from "./NetworkTap.js";
import type { EventBuffer } from "./EventBuffer.js";

/** Minimal contract the HUD needs from the host — no game-engine import. */
export interface HudHost {
  getState: () => unknown;
  /** Connection state from the live socket. */
  getConnectionState: () => string;
  /** Current ack RTT in ms — null when no recent measurement. */
  getLatencyMs: () => number | null;
  /** Last auto-draw tick wall-clock (ms since epoch) — null when none. */
  getLastAutoDrawTick: () => number | null;
  /** Counter of draws triggered so far. */
  getDrawsTriggered: () => number;
  /** Identity panel — first 8 chars of each id only. */
  getIdentity: () => { playerId?: string; walletId?: string; hallId?: string; gameSlug?: string };
}

const HUD_POS_KEY = "spillorama.debug.hud.pos";
const REFRESH_INTERVAL_MS = 250;

export class DebugHud {
  private host: HudHost | null = null;
  private network: NetworkTap | null = null;
  private buffer: EventBuffer | null = null;
  private root: HTMLDivElement | null = null;
  private body: HTMLDivElement | null = null;
  private mounted = false;
  private hidden = false;
  private rafId: number | null = null;
  private lastRender = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private dragOffset: { x: number; y: number } | null = null;
  private dragMoveHandler: ((e: MouseEvent) => void) | null = null;
  private dragUpHandler: (() => void) | null = null;
  private fpsSamples: number[] = [];
  private lastFrameAt = 0;

  setHost(host: HudHost): void {
    this.host = host;
  }

  setNetwork(net: NetworkTap): void {
    this.network = net;
  }

  setBuffer(buf: EventBuffer): void {
    this.buffer = buf;
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.mounted) return;
    this.mounted = true;
    this.root = this.buildRoot();
    parent.appendChild(this.root);
    this.installHotkeys();
    this.restorePosition();
    this.tick();
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.detachDrag();
    this.root?.remove();
    this.root = null;
    this.body = null;
  }

  toggle(): void {
    if (!this.root) return;
    this.hidden = !this.hidden;
    this.root.style.display = this.hidden ? "none" : "block";
  }

  isVisible(): boolean {
    return this.mounted && !this.hidden;
  }

  // ---- internal ----

  private buildRoot(): HTMLDivElement {
    const root = document.createElement("div");
    root.setAttribute("data-testid", "debug-hud");
    root.className = "spillorama-debug-hud";
    Object.assign(root.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      width: "280px",
      zIndex: "999998",
      padding: "0",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "11px",
      lineHeight: "1.4",
      color: "#e6e6e6",
      background: "rgba(8, 10, 14, 0.92)",
      border: "1px solid #d4af37",
      borderRadius: "6px",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
      pointerEvents: "auto",
      userSelect: "none",
    });

    const titleBar = document.createElement("div");
    Object.assign(titleBar.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 10px",
      borderBottom: "1px solid #4a3a14",
      background: "rgba(20, 18, 8, 0.6)",
      cursor: "move",
      fontWeight: "700",
      fontSize: "10px",
      letterSpacing: "0.05em",
      color: "#d4af37",
      textTransform: "uppercase",
    });
    const title = document.createElement("span");
    title.textContent = "DEBUG HUD";
    titleBar.appendChild(title);

    const closeBtn = document.createElement("button");
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      color: "#d4af37",
      cursor: "pointer",
      fontSize: "14px",
      padding: "0 4px",
      lineHeight: "1",
    });
    closeBtn.setAttribute("aria-label", "Hide debug HUD");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.toggle());
    titleBar.appendChild(closeBtn);

    titleBar.addEventListener("mousedown", (e) => this.startDrag(e));
    root.appendChild(titleBar);

    const body = document.createElement("div");
    Object.assign(body.style, { padding: "8px 10px" });
    root.appendChild(body);
    this.body = body;

    return root;
  }

  private installHotkeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      // Ctrl+Shift+D OR F8.
      const ctrlShiftD =
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d";
      const f8 = e.key === "F8";
      if (ctrlShiftD || f8) {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private startDrag(e: MouseEvent): void {
    if (!this.root) return;
    const rect = this.root.getBoundingClientRect();
    this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.dragMoveHandler = (mv: MouseEvent) => this.onDragMove(mv);
    this.dragUpHandler = () => this.endDrag();
    window.addEventListener("mousemove", this.dragMoveHandler);
    window.addEventListener("mouseup", this.dragUpHandler);
  }

  private onDragMove(e: MouseEvent): void {
    if (!this.root || !this.dragOffset) return;
    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    this.root.style.left = `${Math.max(0, x)}px`;
    this.root.style.top = `${Math.max(0, y)}px`;
    this.root.style.right = "auto";
    this.root.style.bottom = "auto";
  }

  private endDrag(): void {
    this.detachDrag();
    if (!this.root) return;
    try {
      const rect = this.root.getBoundingClientRect();
      window.localStorage?.setItem(
        HUD_POS_KEY,
        JSON.stringify({ left: rect.left, top: rect.top }),
      );
    } catch {
      /* ignore */
    }
  }

  private detachDrag(): void {
    if (this.dragMoveHandler) {
      window.removeEventListener("mousemove", this.dragMoveHandler);
      this.dragMoveHandler = null;
    }
    if (this.dragUpHandler) {
      window.removeEventListener("mouseup", this.dragUpHandler);
      this.dragUpHandler = null;
    }
    this.dragOffset = null;
  }

  private restorePosition(): void {
    if (!this.root) return;
    try {
      const raw = window.localStorage?.getItem(HUD_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw) as { left?: number; top?: number };
      if (typeof pos.left === "number" && typeof pos.top === "number") {
        this.root.style.left = `${pos.left}px`;
        this.root.style.top = `${pos.top}px`;
        this.root.style.right = "auto";
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Animation-frame loop. We sample on every frame for FPS but only
   * re-render the body 4 times per second — re-rendering on every frame
   * makes the operator's screen flash in DevTools and drowns the paint
   * counter in PerfHud.
   */
  private tick = (): void => {
    if (!this.mounted) return;
    const now = performance.now();
    if (this.lastFrameAt > 0) {
      const dt = now - this.lastFrameAt;
      if (dt > 0) this.fpsSamples.push(1000 / dt);
      if (this.fpsSamples.length > 60) {
        this.fpsSamples.splice(0, this.fpsSamples.length - 60);
      }
    }
    this.lastFrameAt = now;

    if (now - this.lastRender >= REFRESH_INTERVAL_MS) {
      this.lastRender = now;
      if (!this.hidden) this.render();
    }
    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private render(): void {
    if (!this.body) return;
    const host = this.host;
    const state = (host?.getState?.() ?? {}) as Record<string, unknown>;
    const ident = host?.getIdentity?.() ?? {};
    const conn = host?.getConnectionState?.() ?? "—";
    const latency = host?.getLatencyMs?.();
    const tick = host?.getLastAutoDrawTick?.();
    const draws = host?.getDrawsTriggered?.();
    const tap = this.network;
    const tp = tap?.throughput(2000) ?? { sent: 0, received: 0 };
    const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    const fps =
      this.fpsSamples.length > 0
        ? this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length
        : 0;
    const events = this.buffer?.size() ?? 0;

    // Avoid string-replacement churn by writing structured rows once and
    // updating `textContent` in place.
    const rows: Array<[string, string, string?]> = [
      ["Game", `${ident.gameSlug ?? "—"}`],
      ["Hall", short(ident.hallId)],
      ["Player", short(ident.playerId)],
      ["Wallet", short(ident.walletId)],
      ["Room", String((state.roomCode as string | undefined) ?? "—")],
      ["Status", String((state.gameStatus as string | undefined) ?? "—")],
      ["Conn", conn, conn === "connected" ? "#3ddc84" : conn === "disconnected" ? "#ff5c5c" : "#ffbb33"],
      [
        "Latency",
        latency === null || latency === undefined ? "—" : `${latency.toFixed(0)} ms`,
      ],
      [
        "Tick",
        tick ? `${((Date.now() - tick) / 1000).toFixed(1)}s ago` : "—",
      ],
      ["DrawsTrig", String(draws ?? 0)],
      [
        "Drawn",
        `${(state.drawCount as number | undefined) ?? 0} / ${(state.totalDrawCapacity as number | undefined) ?? 0}`,
      ],
      [
        "Pot",
        `${(state.prizePool as number | undefined)?.toFixed?.(0) ?? state.prizePool ?? 0} kr`,
      ],
      ["MyTickets", String((state.myTickets as unknown[] | undefined)?.length ?? 0)],
      [
        "MyMarks",
        String(
          (state.myMarks as number[][] | undefined)?.reduce(
            (sum, arr) => sum + (arr?.length ?? 0),
            0,
          ) ?? 0,
        ),
      ],
      ["TX/s", `${(tp.sent / 1024).toFixed(1)} KB`],
      ["RX/s", `${(tp.received / 1024).toFixed(1)} KB`],
      ["FPS", fps.toFixed(0), fps < 30 ? "#ff5c5c" : fps < 50 ? "#ffbb33" : "#3ddc84"],
      [
        "Mem",
        mem?.usedJSHeapSize
          ? `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`
          : "—",
      ],
      ["Events", String(events)],
    ];

    if (this.body.childElementCount !== rows.length) {
      this.body.textContent = "";
      for (const _ of rows) {
        const line = document.createElement("div");
        Object.assign(line.style, {
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
        });
        const label = document.createElement("span");
        label.setAttribute("data-role", "k");
        Object.assign(label.style, { color: "#9aa0a6" });
        const val = document.createElement("span");
        val.setAttribute("data-role", "v");
        Object.assign(val.style, { fontWeight: "600" });
        line.append(label, val);
        this.body.append(line);
      }
    }

    const lines = this.body.children;
    for (let i = 0; i < rows.length; i++) {
      const [k, v, colour] = rows[i];
      const line = lines[i] as HTMLElement | undefined;
      if (!line) continue;
      const kEl = line.querySelector<HTMLElement>('[data-role="k"]');
      const vEl = line.querySelector<HTMLElement>('[data-role="v"]');
      const kText = `${k}:`;
      if (kEl && kEl.textContent !== kText) kEl.textContent = kText;
      if (vEl && vEl.textContent !== v) vEl.textContent = v;
      if (vEl) {
        const c = colour ?? "#e6e6e6";
        if (vEl.style.color !== c) vEl.style.color = c;
      }
    }
  }
}

function short(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
