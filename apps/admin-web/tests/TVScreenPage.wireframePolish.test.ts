/**
 * Wireframe PDF 16 §16.5 polish — KPI-row + "Hall Belongs To"-kolonne på live
 * TV-skjerm + Full House banner-fanfare.
 *
 * Spec: docs/architecture/WIREFRAME_CATALOG.md PDF 16 §16.5 + dette PR-sin
 * agent-prompt.
 *
 * Dekker:
 *   1. KPI-row rendres med drawnCount, fullHouseWinners, patternsWon
 *   2. KPI-row oppdateres ved poll (drawnCount stiger fra 0 → 12)
 *   3. Patterns-tabellen viser "Hall Belongs To"-kolonne med hallNames-data
 *   4. Tom hallNames vises som "—" (ingen vinner ennå)
 *   5. Multi-hall hallNames join'es med ", "
 *   6. Full House (phase=5) banner får ekstra `tv-phase-banner-fullhouse`-class
 *   7. Andre faser (phase=1..4) har ikke fullhouse-class
 *   8. Class fjernes når banner-køen er tom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mountTvScreenPage, unmountTvScreenPage } from "../src/pages/tv/TVScreenPage.js";
import * as tvSocketModule from "../src/pages/tv/tvScreenSocket.js";

function mkContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.append(div);
  return div;
}

interface MockStateOpts {
  drawnCount?: number;
  fullHouseWinners?: number;
  patternsWon?: number;
  patterns?: Array<{
    name: string;
    phase: number;
    playersWon: number;
    prize: number;
    highlighted: boolean;
    hallNames: string[];
  }>;
}

function mockFetchWithState(opts: MockStateOpts = {}) {
  const drawnCount = opts.drawnCount ?? 0;
  const fullHouseWinners = opts.fullHouseWinners ?? 0;
  const patternsWon = opts.patternsWon ?? 0;
  const patterns =
    opts.patterns ?? [
      { name: "Row 1", phase: 1, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
      { name: "Row 2", phase: 2, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
      { name: "Row 3", phase: 3, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
      { name: "Row 4", phase: 4, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
      {
        name: "Full House",
        phase: 5,
        playersWon: 0,
        prize: 0,
        highlighted: false,
        hallNames: [],
      },
    ];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.endsWith("/voice")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: { voice: "voice1" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              hall: { id: "hall-1", name: "Test Hall" },
              currentGame: {
                id: "sg-1",
                name: "Test Game",
                number: 1,
                startAt: "2026-04-30T20:00:00Z",
                ballsDrawn: [],
                lastBall: null,
              },
              patterns,
              drawnCount,
              totalBalls: 75,
              fullHouseWinners,
              patternsWon,
              nextGame: null,
              countdownToNextGame: null,
              status: "drawing",
              participatingHalls: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    })
  );
}

interface CapturedHandlers {
  onPhaseWon?: (payload: {
    gameId: string;
    patternName: string;
    phase: number;
  }) => void;
  onHallStatusUpdate?: (payload: { hallId: string; color?: "red" | "orange" | "green" }) => void;
}

function spySocket(captured: CapturedHandlers) {
  return vi
    .spyOn(tvSocketModule, "connectTvScreenSocket")
    .mockImplementation((opts) => {
      captured.onPhaseWon = opts.handlers.onPhaseWon;
      captured.onHallStatusUpdate = opts.handlers.onHallStatusUpdate;
      return {
        dispose: () => undefined,
        isConnected: () => true,
      };
    });
}

describe("TVScreenPage — wireframe-paritet KPI-row + Hall Belongs To", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = mkContainer();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    unmountTvScreenPage();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("KPI-row rendres med drawnCount, fullHouseWinners, patternsWon", async () => {
    mockFetchWithState({ drawnCount: 42, fullHouseWinners: 1, patternsWon: 5 });
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const numbers = container.querySelector<HTMLElement>(
      "[data-testid='tv-kpi-numbers-value']"
    );
    const fullHouse = container.querySelector<HTMLElement>(
      "[data-testid='tv-kpi-fullhouse-value']"
    );
    const patterns = container.querySelector<HTMLElement>(
      "[data-testid='tv-kpi-patterns-value']"
    );

    expect(numbers?.textContent).toBe("42");
    expect(fullHouse?.textContent).toBe("1");
    expect(patterns?.textContent).toBe("5");
  });

  it("KPI-row labels matcher wireframe (Total Numbers / Full House Winners / Patterns Won)", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const labels = container.querySelectorAll<HTMLElement>(".tv-kpi-label");
    expect(labels.length).toBe(3);
    expect(labels[0]?.textContent?.trim()).toBe("Total Numbers Withdrawn");
    expect(labels[1]?.textContent?.trim()).toBe("Full House Winners");
    expect(labels[2]?.textContent?.trim()).toBe("Patterns Won");
  });

  it("Pattern-tabellen viser 'Hall Belongs To'-kolonne", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const headers = container.querySelectorAll<HTMLElement>(".tv-patterns-table thead th");
    expect(headers.length).toBe(4);
    expect(headers[3]?.textContent?.trim()).toBe("Hall Belongs To");
  });

  it("Tom hallNames vises som '—' i pattern-tabell", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const hallCells = container.querySelectorAll<HTMLElement>(
      "[data-testid='tv-pattern-hall']"
    );
    expect(hallCells.length).toBe(5);
    for (const cell of Array.from(hallCells)) {
      expect(cell.textContent?.trim()).toBe("—");
    }
  });

  it("Single hall i hallNames vises som hall-navnet alene", async () => {
    mockFetchWithState({
      patterns: [
        {
          name: "Row 1",
          phase: 1,
          playersWon: 3,
          prize: 30000,
          highlighted: true,
          hallNames: ["Notodden Bingo"],
        },
        { name: "Row 2", phase: 2, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 3", phase: 3, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 4", phase: 4, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        {
          name: "Full House",
          phase: 5,
          playersWon: 0,
          prize: 0,
          highlighted: false,
          hallNames: [],
        },
      ],
    });
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const hallCells = container.querySelectorAll<HTMLElement>(
      "[data-testid='tv-pattern-hall']"
    );
    expect(hallCells[0]?.textContent?.trim()).toBe("Notodden Bingo");
    expect(hallCells[1]?.textContent?.trim()).toBe("—");
  });

  it("Multi-hall hallNames join'es med ', '", async () => {
    mockFetchWithState({
      patterns: [
        {
          name: "Row 1",
          phase: 1,
          playersWon: 6,
          prize: 60000,
          highlighted: true,
          hallNames: ["Hamar Bingo", "Lillehammer Bingo", "Notodden Bingo"],
        },
        { name: "Row 2", phase: 2, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 3", phase: 3, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 4", phase: 4, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        {
          name: "Full House",
          phase: 5,
          playersWon: 0,
          prize: 0,
          highlighted: false,
          hallNames: [],
        },
      ],
    });
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    const firstRow = container.querySelector<HTMLElement>(
      "[data-testid='tv-pattern-hall']"
    );
    expect(firstRow?.textContent?.trim()).toBe(
      "Hamar Bingo, Lillehammer Bingo, Notodden Bingo"
    );
  });

  it("HTML i hallNames escapes (XSS-safe)", async () => {
    mockFetchWithState({
      patterns: [
        {
          name: "Row 1",
          phase: 1,
          playersWon: 1,
          prize: 1000,
          highlighted: true,
          hallNames: ["<script>alert(1)</script>"],
        },
        { name: "Row 2", phase: 2, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 3", phase: 3, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        { name: "Row 4", phase: 4, playersWon: 0, prize: 0, highlighted: false, hallNames: [] },
        {
          name: "Full House",
          phase: 5,
          playersWon: 0,
          prize: 0,
          highlighted: false,
          hallNames: [],
        },
      ],
    });
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    // No injected <script> as a child node — text-only.
    const inserted = container.querySelector("script");
    expect(inserted).toBeNull();
    const cell = container.querySelector<HTMLElement>("[data-testid='tv-pattern-hall']");
    // Innholdet er trygt rendret som tekst, ikke som markup.
    expect(cell?.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("TVScreenPage — Full House banner fanfare", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = mkContainer();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    unmountTvScreenPage();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Phase 5 (Full House) banner får 'tv-phase-banner-fullhouse'-class", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    captured.onPhaseWon!({ gameId: "sg-1", patternName: "Full House", phase: 5 });
    await vi.advanceTimersByTimeAsync(0);

    const banner = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner']"
    )!;
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(true);
    expect(banner.classList.contains("tv-phase-banner-hidden")).toBe(false);
  });

  it("Phase 1-4 (Row 1-4) banner har IKKE 'tv-phase-banner-fullhouse'-class", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    captured.onPhaseWon!({ gameId: "sg-1", patternName: "Row 1", phase: 1 });
    await vi.advanceTimersByTimeAsync(0);

    const banner = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner']"
    )!;
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(false);
    // Banner er likevel synlig (vanlig BINGO-banner for Row 1).
    expect(banner.classList.contains("tv-phase-banner-hidden")).toBe(false);
  });

  it("Etter banner skjules, fjernes 'tv-phase-banner-fullhouse'-class", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    captured.onPhaseWon!({ gameId: "sg-1", patternName: "Full House", phase: 5 });
    await vi.advanceTimersByTimeAsync(0);
    const banner = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner']"
    )!;
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(true);

    // Etter 3s + litt margin → banner skjules + class fjernes.
    await vi.advanceTimersByTimeAsync(3500);
    expect(banner.classList.contains("tv-phase-banner-hidden")).toBe(true);
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(false);
  });

  it("Sekvensiell Row 1 → Full House: kun Full House får fanfare-class", async () => {
    mockFetchWithState({});
    const captured: CapturedHandlers = {};
    spySocket(captured);
    mountTvScreenPage(container, "hall-1", "token-abc");
    await vi.advanceTimersByTimeAsync(30);

    // Row 1 først.
    captured.onPhaseWon!({ gameId: "sg-1", patternName: "Row 1", phase: 1 });
    await vi.advanceTimersByTimeAsync(0);
    // Full House andre (køes).
    captured.onPhaseWon!({ gameId: "sg-1", patternName: "Full House", phase: 5 });
    await vi.advanceTimersByTimeAsync(0);

    const banner = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner']"
    )!;
    // Første banner: Row 1 — IKKE fullhouse.
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(false);
    const firstPattern = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner-pattern']"
    )!;
    expect(firstPattern.textContent?.trim()).toBe("Row 1");

    // Etter 3s: andre banner i køen vises (Full House).
    await vi.advanceTimersByTimeAsync(3001);
    const secondPattern = container.querySelector<HTMLElement>(
      "[data-testid='tv-phase-banner-pattern']"
    )!;
    expect(secondPattern.textContent?.trim()).toBe("Full House");
    expect(banner.classList.contains("tv-phase-banner-fullhouse")).toBe(true);
  });
});
