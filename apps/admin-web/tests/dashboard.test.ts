import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { classifyRoom, emptyOngoingGames, fetchDashboardData } from "../src/pages/dashboard/DashboardState.js";
import { renderInfoBox } from "../src/pages/dashboard/widgets/InfoBox.js";
import { renderLatestRequestsBox } from "../src/pages/dashboard/widgets/LatestRequestsBox.js";
import { renderTopPlayersBox } from "../src/pages/dashboard/widgets/TopPlayersBox.js";
import { renderOngoingGamesTabs } from "../src/pages/dashboard/widgets/OngoingGamesTabs.js";
import { initI18n } from "../src/i18n/I18n.js";

describe("DashboardState — classifyRoom", () => {
  it("maps bingo rooms to game1", () => {
    expect(classifyRoom({ code: "R1", hallId: "h1", currentGame: { id: "g", status: "RUNNING", gameSlug: "bingo" } } as never)).toBe("game1");
    expect(classifyRoom({ code: "R2", hallId: "h1", currentGame: { id: "g", status: "RUNNING", gameSlug: "bingo-1-75" } } as never)).toBe("game1");
  });

  it("maps bingo-90 to game2", () => {
    expect(classifyRoom({ code: "R", hallId: "h", currentGame: { id: "g", status: "RUNNING", gameSlug: "bingo-90" } } as never)).toBe("game2");
  });

  it("maps wheel/chest to game4/game5", () => {
    expect(classifyRoom({ code: "R", hallId: "h", currentGame: { id: "g", status: "RUNNING", gameSlug: "wheel-of-fortune" } } as never)).toBe("game4");
    expect(classifyRoom({ code: "R", hallId: "h", currentGame: { id: "g", status: "RUNNING", gameSlug: "treasure-chest" } } as never)).toBe("game5");
  });

  it("defaults unknown slug to game1", () => {
    expect(classifyRoom({ code: "R", hallId: "h", currentGame: { id: "g", status: "RUNNING", gameSlug: "unknown" } } as never)).toBe("game1");
  });

  it("emptyOngoingGames returns all 5 tabs with empty arrays", () => {
    const e = emptyOngoingGames();
    expect(Object.keys(e)).toEqual(["game1", "game2", "game3", "game4", "game5"]);
    for (const tab of Object.values(e)) expect(tab).toEqual([]);
  });
});

describe("DashboardState — fetchDashboardData", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    initI18n();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("aggregates from multiple endpoints; missing ones return null/[] gracefully", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/admin/halls")) return okJson([{ id: "h1", name: "Hall 1", isActive: true }, { id: "h2", name: "Hall 2", isActive: false }]);
      if (u.includes("/api/admin/users?role=agent")) return okJson({ users: [{ id: "a1", email: "a@x", role: "agent", isActive: true }], count: 1 });
      if (u.includes("/api/admin/hall-groups")) return notImpl();
      if (u.includes("/api/admin/players/top")) return notImpl();
      if (u.includes("/api/admin/payments/requests")) {
        return okJson({ requests: [
          { id: "r1", kind: "deposit", status: "pending", userId: "u", username: "alice", email: "a@x", hallName: "Hall 1", createdAt: "2026-04-19T10:00:00Z", amount: 100, currency: "NOK" },
        ] });
      }
      if (u.includes("/api/admin/rooms")) return okJson([
        { code: "R1", hallId: "h1", hallName: "Hall 1", currentGame: { id: "g1", status: "RUNNING", gameSlug: "bingo" } },
        { code: "R2", hallId: "h2", hallName: "Hall 2", currentGame: { id: "g2", status: "RUNNING", gameSlug: "wheel-of-fortune" } },
      ]);
      return notImpl();
    }) as unknown as typeof fetch;

    const data = await fetchDashboardData();
    expect(data.summary.activeHalls).toEqual({ active: 1, total: 2 });
    expect(data.summary.activeAgents).toEqual({ active: 1, total: 1 });
    expect(data.summary.activeHallGroups).toBeNull();
    expect(data.summary.totalApprovedPlayers).toBeNull();
    expect(data.latestRequests).toHaveLength(1);
    expect(data.topPlayers).toBeNull();
    expect(data.ongoingGames.game1).toHaveLength(1);
    expect(data.ongoingGames.game4).toHaveLength(1);
    expect(data.ongoingGames.game2).toHaveLength(0);
  });
});

describe("InfoBox", () => {
  it("renders label + icon + bg-color + value", () => {
    const el = renderInfoBox({ labelLine1: "Total", labelLine2: "Halls", value: "3/5", icon: "fa fa-building", color: "green" });
    expect(el.querySelector(".info-box-icon.bg-green")).toBeTruthy();
    expect(el.querySelector(".info-box-number")?.textContent).toBe("3/5");
    expect(el.querySelector(".info-box-text")?.textContent).toContain("Total");
    expect(el.querySelector(".info-box-text")?.textContent).toContain("Halls");
  });

  it("wraps in <a> when href is provided", () => {
    const el = renderInfoBox({ labelLine1: "x", labelLine2: "y", value: "1", icon: "fa fa-user", color: "blue", href: "#/player" });
    expect(el.querySelector("a")?.getAttribute("href")).toBe("#/player");
  });

  it("renders '—' placeholder when value is a string", () => {
    const el = renderInfoBox({ labelLine1: "x", labelLine2: "y", value: "—", icon: "fa fa-user", color: "blue" });
    expect(el.querySelector(".info-box-number")?.textContent).toBe("—");
  });
});

describe("LatestRequestsBox", () => {
  beforeEach(() => initI18n());

  it("renders empty state when requests is empty", () => {
    const el = renderLatestRequestsBox({ requests: [], role: "admin", totalPending: 0 });
    expect(el.querySelector("table")).toBeTruthy();
    expect(el.textContent).toContain("Ingen data tilgjengelig i tabellen");
  });

  it("shows hall + agent columns only for admin", () => {
    const agent = renderLatestRequestsBox({ requests: [], role: "agent", totalPending: 0 });
    const admin = renderLatestRequestsBox({ requests: [], role: "admin", totalPending: 0 });
    const agentCols = agent.querySelectorAll("thead th").length;
    const adminCols = admin.querySelectorAll("thead th").length;
    expect(adminCols).toBe(agentCols + 2);
  });

  it("renders each request as a row", () => {
    const el = renderLatestRequestsBox({
      requests: [
        { id: "r1", kind: "deposit", status: "pending", userId: "u", username: "alice", email: "a@x", hallName: "Hall 1", agentName: "Per", createdAt: "2026-04-19T10:00:00Z", amount: 100, currency: "NOK" },
        { id: "r2", kind: "deposit", status: "pending", userId: "u2", username: "bob", email: "b@x", hallName: "Hall 2", createdAt: "2026-04-19T11:00:00Z", amount: 200, currency: "NOK" },
      ],
      role: "admin",
      totalPending: 2,
    });
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(el.textContent).toContain("alice");
    expect(el.textContent).toContain("bob");
  });
});

describe("TopPlayersBox", () => {
  beforeEach(() => initI18n());

  it("shows pending-endpoint placeholder when players is null", () => {
    const el = renderTopPlayersBox({ players: null, role: "admin" });
    expect(el.textContent).toContain("BIN-A2-API-2");
  });

  it("shows no-data message for empty array", () => {
    const el = renderTopPlayersBox({ players: [], role: "admin" });
    expect(el.textContent).toContain("Ingen data");
  });

  it("renders top player row with wallet amount for admin", () => {
    const el = renderTopPlayersBox({
      players: [{ id: "p1", username: "alice", walletAmount: 1234, avatar: "/img/a.png" }],
      role: "admin",
    });
    expect(el.textContent).toContain("alice");
    expect(el.textContent).toContain("1234 Kr");
    expect(el.querySelector("a.users-list-name")).toBeTruthy();
  });

  it("omits deep-link to /player for agent without permission", () => {
    const el = renderTopPlayersBox({
      players: [{ id: "p1", username: "alice", walletAmount: 500 }],
      role: "agent",
    });
    expect(el.querySelector("a.users-list-name")).toBeFalsy();
    expect(el.querySelector("span.users-list-name")).toBeTruthy();
  });
});

describe("OngoingGamesTabs", () => {
  beforeEach(() => initI18n());

  it("renders 5 tab headers with Game2 active by default", () => {
    const el = renderOngoingGamesTabs({ games: emptyOngoingGames() });
    const tabs = el.querySelectorAll(".nav-tabs > li");
    expect(tabs).toHaveLength(5);
    expect(tabs[1]?.classList.contains("active")).toBe(true);
  });

  it("switches active tab on click", () => {
    const el = renderOngoingGamesTabs({ games: emptyOngoingGames() });
    document.body.append(el);
    const game3Tab = el.querySelector<HTMLAnchorElement>("[data-game-tab='game3']")!;
    game3Tab.click();
    const activePane = el.querySelector(".tab-pane.active");
    expect(activePane?.id).toBe("tab-game3");
  });

  it("renders 'No data' per-tab when the tab's rooms array is empty", () => {
    const el = renderOngoingGamesTabs({ games: emptyOngoingGames() });
    const pane1 = el.querySelector("#tab-game1");
    expect(pane1?.textContent).toContain("Ingen data tilgjengelig i tabellen");
  });

  it("renders rooms as rows in the matching tab", () => {
    const games = emptyOngoingGames();
    games.game2.push({ code: "R1", hallId: "h1", hallName: "Hall 1", currentGame: { id: "g-ABC-123-456", status: "RUNNING", gameSlug: "bingo-90", luckyNumberPrize: 500 } } as never);
    const el = renderOngoingGamesTabs({ games });
    const pane2 = el.querySelector("#tab-game2");
    const rows = pane2?.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(pane2?.textContent).toContain("500");
    expect(pane2?.textContent).toContain("Hall 1");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function notImpl(): Response {
  return new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "" } }), { status: 404 });
}
