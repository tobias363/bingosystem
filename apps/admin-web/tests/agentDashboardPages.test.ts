/**
 * Agent-portal skeleton-dashboard + player-list admin-UI-sider.
 *
 * Agent-portal skeleton PR omskrev AgentDashboardPage til ren skjelett-
 * visning med KPI + Latest Requests + Top 5 Players + Ongoing Games tabs
 * (placeholder-bokser). Tidligere shift-info-varianten flyttes til
 * /agent/cashinout-flyten i en oppfølger-PR (se /agent/cashinout route).
 *
 * Tester:
 *   - AgentDashboardPage rendrer KPI-boks + Latest Requests-widget + Top
 *     5 Players-widget + Ongoing Games tabs (game1-4)
 *   - AgentPlayersPage viser liste og export-knapp
 *   - Routes eksisterer i routes.ts med agent+hall-operator roles
 *   - Placeholder-routes for /agent/* skeleton registrert
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { findRoute } from "../src/router/routes.js";
import { initI18n } from "../src/i18n/I18n.js";

const originalFetch = globalThis.fetch;

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("routes — agent-portal skeleton", () => {
  it("/agent/dashboard route finnes med riktig titleKey og roles", () => {
    const r = findRoute("/agent/dashboard");
    expect(r).toBeDefined();
    expect(r?.titleKey).toBe("agent_dashboard");
    expect(r?.roles).toContain("agent");
    expect(r?.roles).toContain("hall-operator");
  });

  it("/agent/players route finnes", () => {
    const r = findRoute("/agent/players");
    expect(r).toBeDefined();
    expect(r?.titleKey).toBe("agent_players_title");
    expect(r?.roles).toContain("agent");
    expect(r?.roles).toContain("hall-operator");
  });

  it("registrerer alle agent-portal skeleton-routes", () => {
    const skeletonPaths = [
      "/agent/physical-tickets",
      "/agent/games",
      "/agent/cash-in-out",
      "/agent/unique-id",
      "/agent/physical-cashout",
    ];
    for (const p of skeletonPaths) {
      const r = findRoute(p);
      expect(r, `route ${p} skal finnes`).toBeDefined();
      expect(r?.roles).toContain("agent");
      expect(r?.roles).toContain("hall-operator");
    }
  });
});

describe("AgentDashboardPage (skeleton)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = '<div id="c"></div>';
    window.localStorage.setItem("bingo_admin_access_token", "tok-test");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem("bingo_admin_access_token");
  });

  it("rendrer KPI-boks, Latest Requests, Top 5 Players og Ongoing Games tabs", async () => {
    const container = document.getElementById("c")!;
    const mod = await import("../src/pages/agent-dashboard/AgentDashboardPage.js");
    mod.mountAgentDashboard(container);
    // Skeleton rendrer synkront — ingen fetch/polling
    expect(container.querySelector("[data-marker='agent-dashboard-kpis']")).toBeTruthy();
    expect(container.querySelector("[data-kpi='approved-players']")).toBeTruthy();
    expect(container.querySelector("[data-marker='agent-dashboard-latest-requests']")).toBeTruthy();
    expect(container.querySelector("[data-marker='agent-dashboard-top-players']")).toBeTruthy();
    expect(container.querySelector("[data-marker='agent-dashboard-ongoing-games']")).toBeTruthy();

    // Sjekk at alle 4 game-tabs finnes (Game 1-4)
    const tabs = container.querySelectorAll("a[data-game-tab]");
    expect(tabs).toHaveLength(4);
    const tabIds = Array.from(tabs).map((a) => a.getAttribute("data-game-tab"));
    expect(tabIds).toEqual(["game1", "game2", "game3", "game4"]);

    // Placeholder-merke ("Kommer snart") i alle 4 panes
    const panes = container.querySelectorAll("[data-marker='ongoing-games-pane']");
    expect(panes).toHaveLength(4);

    // 5 dummy latest-request-rader og 5 top-player-rader
    expect(container.querySelectorAll("[data-marker='latest-request-row']")).toHaveLength(5);
    expect(container.querySelectorAll("[data-marker='top-player-row']")).toHaveLength(5);
  });

  it("tab-bytting oppdaterer active-klasse", async () => {
    const container = document.getElementById("c")!;
    const mod = await import("../src/pages/agent-dashboard/AgentDashboardPage.js");
    mod.mountAgentDashboard(container);

    // Default active tab er game1
    const pane1 = container.querySelector("#tab-game1");
    const pane2 = container.querySelector("#tab-game2");
    expect(pane1?.classList.contains("active")).toBe(true);
    expect(pane2?.classList.contains("active")).toBe(false);

    // Klikk på game2 tab
    const tab2 = container.querySelector<HTMLAnchorElement>("a[data-game-tab='game2']");
    tab2!.click();
    expect(pane1?.classList.contains("active")).toBe(false);
    expect(pane2?.classList.contains("active")).toBe(true);
  });

  it("unmountAgentDashboard er no-op (skeleton har ingen timere)", async () => {
    const container = document.getElementById("c")!;
    const mod = await import("../src/pages/agent-dashboard/AgentDashboardPage.js");
    mod.mountAgentDashboard(container);
    // Skal ikke kaste eller ha bivirkninger
    expect(() => mod.unmountAgentDashboard()).not.toThrow();
  });
});

describe("AgentPlayersPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = '<div id="c"></div>';
    window.localStorage.setItem("bingo_admin_access_token", "tok-test");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem("bingo_admin_access_token");
  });

  it("rendrer spiller-tabell med export-knapp", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okJson({
        hallId: "hall-a",
        players: [
          {
            id: "p1",
            email: "alice@x.no",
            displayName: "Alice",
            surname: "Alvegard",
            phone: "12345678",
            kycStatus: "VERIFIED",
            createdAt: "2026-04-21T08:00:00Z",
          },
        ],
        count: 1,
        limit: 100,
      })
    );
    const container = document.getElementById("c")!;
    const mod = await import("../src/pages/agent-players/AgentPlayersPage.js");
    mod.mountAgentPlayers(container);
    await new Promise((r) => setTimeout(r, 50));
    const table = container.querySelector<HTMLTableElement>("#agent-players-table");
    expect(table).toBeTruthy();
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("alice@x.no");
    const exportBtn = container.querySelector<HTMLButtonElement>("[data-export-id='p1']");
    expect(exportBtn).toBeTruthy();
  });

  it("viser 'ingen spillere' når liste er tom", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      okJson({ hallId: "hall-a", players: [], count: 0, limit: 100 })
    );
    const container = document.getElementById("c")!;
    const mod = await import("../src/pages/agent-players/AgentPlayersPage.js");
    mod.mountAgentPlayers(container);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent?.toLowerCase()).toContain("ingen spillere");
  });
});
