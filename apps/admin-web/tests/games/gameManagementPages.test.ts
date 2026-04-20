// Render + dispatcher tests for gameManagement pages.
//
// BIN-622 CRUD er nå merget i backend og admin-UI-en bruker de ekte
// endepunktene. Testene mocker fetch for å validere rendering + dispatcher.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initI18n } from "../../src/i18n/I18n.js";
import { renderGameManagementPage } from "../../src/pages/games/gameManagement/GameManagementPage.js";
import {
  renderGameManagementAddG3Page,
  renderGameManagementViewPage,
  renderGameManagementViewG3Page,
  renderGameManagementTicketsPage,
  renderGameManagementSubGamesPage,
  renderGameManagementCloseDayPage,
} from "../../src/pages/games/gameManagement/GameManagementDetailPages.js";
import { isGamesRoute } from "../../src/pages/games/index.js";

// Mock the GameType fetch so detail pages have a name to render.
vi.mock("../../src/pages/games/gameType/GameTypeState.js", async () => {
  return {
    fetchGameTypeList: async () => [
      { _id: "bingo", slug: "bingo", name: "Spill1", type: "game_1", row: 5, columns: 5, photo: "bingo.png", pattern: true },
      { _id: "monsterbingo", slug: "monsterbingo", name: "Spill3", type: "game_3", row: 5, columns: 5, photo: "mb.png", pattern: true },
    ],
    fetchGameType: async (slug: string) => {
      const all: Record<string, { _id: string; slug: string; name: string; type: string; row: number; columns: number; photo: string; pattern: boolean }> = {
        bingo: { _id: "bingo", slug: "bingo", name: "Spill1", type: "game_1", row: 5, columns: 5, photo: "bingo.png", pattern: true },
        monsterbingo: { _id: "monsterbingo", slug: "monsterbingo", name: "Spill3", type: "game_3", row: 5, columns: 5, photo: "mb.png", pattern: true },
      };
      return all[slug] ?? null;
    },
  };
});

function installFetchMock(response: { ok?: boolean; status?: number; body?: unknown }) {
  const resp = {
    ok: response.ok ?? true,
    status: response.status ?? 200,
    body: response.body ?? { ok: true, data: { games: [], count: 0 } },
  };
  const fetchMock = vi.fn(async () => {
    return {
      ok: resp.ok,
      status: resp.status,
      async json() {
        return resp.body;
      },
    } as unknown as Response;
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("GameManagementPage (list/picker)", () => {
  beforeEach(() => {
    initI18n();
    installFetchMock({});
  });
  afterEach(() => {
    window.location.hash = "";
  });

  it("renders the type-picker select with options from GameType list", async () => {
    const c = document.createElement("div");
    await renderGameManagementPage(c);
    const picker = c.querySelector<HTMLSelectElement>("#gm-type-picker");
    expect(picker).not.toBeNull();
    const opts = c.querySelectorAll("#gm-type-picker option");
    // One default + 2 mocked types (no Game 4 in the mock, so no filtering needed).
    expect(opts.length).toBe(3);
  });

  it("without typeId, Add-button is disabled (aria-disabled + onclick=return false)", async () => {
    const c = document.createElement("div");
    await renderGameManagementPage(c);
    const addBtn = c.querySelector<HTMLAnchorElement>("#gm-add-btn");
    expect(addBtn).not.toBeNull();
    expect(addBtn?.getAttribute("aria-disabled")).toBe("true");
  });

  it("with typeId, Add-button links to /gameManagement/:typeId/add", async () => {
    const c = document.createElement("div");
    await renderGameManagementPage(c, "bingo");
    const addBtn = c.querySelector<HTMLAnchorElement>("#gm-add-btn");
    expect(addBtn).not.toBeNull();
    expect(addBtn?.getAttribute("href")).toBe("#/gameManagement/bingo/add");
    expect(addBtn?.getAttribute("aria-disabled")).toBeNull();
  });

  it("when typeId is provided, renders the header with game name", async () => {
    const c = document.createElement("div");
    await renderGameManagementPage(c, "bingo");
    expect(c.querySelector("#gm-list-header h1")?.textContent).toContain("Spill1");
    // Banner skal være tom nå som BIN-622 er merget.
    const banner = c.querySelector("#gm-backend-banner");
    expect(banner?.innerHTML.trim()).toBe("");
  });
});

describe("GameManagement detail pages (BIN-623 placeholders)", () => {
  beforeEach(() => {
    initI18n();
    installFetchMock({});
  });

  it("add-g3 page renders banner with BIN-622 and Game 3 wording", async () => {
    const c = document.createElement("div");
    await renderGameManagementAddG3Page(c, "monsterbingo");
    expect(c.querySelector(".alert")?.textContent).toContain("BIN-622");
    expect(c.querySelector("h1")?.textContent).toContain("Spill3");
  });
  it("view page shows id in title", async () => {
    const c = document.createElement("div");
    await renderGameManagementViewPage(c, "bingo", "gm-42");
    expect(c.querySelector("h1")?.textContent).toContain("gm-42");
  });
  it("view-g3 page shows id in title", async () => {
    const c = document.createElement("div");
    await renderGameManagementViewG3Page(c, "monsterbingo", "gm3-42");
    expect(c.querySelector("h1")?.textContent).toContain("gm3-42");
  });
  it("tickets page shows ticket label + id", async () => {
    const c = document.createElement("div");
    await renderGameManagementTicketsPage(c, "bingo", "gm-42");
    expect(c.querySelector("h1")?.textContent).toContain("gm-42");
  });
  it("subGames page shows sub_game label + id", async () => {
    const c = document.createElement("div");
    await renderGameManagementSubGamesPage(c, "bingo", "gm-42");
    expect(c.querySelector("h1")?.textContent).toContain("gm-42");
  });
  it("closeDay page cites BIN-623 (not BIN-622)", async () => {
    const c = document.createElement("div");
    await renderGameManagementCloseDayPage(c, "bingo", "gm-42");
    expect(c.querySelector(".alert")?.textContent).toContain("BIN-623");
  });
});

describe("games dispatcher — gameManagement routes recognised", () => {
  it("matches /gameManagement", () => {
    expect(isGamesRoute("/gameManagement")).toBe(true);
    expect(isGamesRoute("/gameManagement?typeId=bingo")).toBe(true);
  });
  it("matches /gameManagement/:typeId/add and /add-g3", () => {
    expect(isGamesRoute("/gameManagement/bingo/add")).toBe(true);
    expect(isGamesRoute("/gameManagement/monsterbingo/add-g3")).toBe(true);
  });
  it("matches /gameManagement/:typeId/view/:id and /view-g3/:id", () => {
    expect(isGamesRoute("/gameManagement/bingo/view/gm-1")).toBe(true);
    expect(isGamesRoute("/gameManagement/monsterbingo/view-g3/gm-1")).toBe(true);
  });
  it("matches /gameManagement/:typeId/tickets/:id", () => {
    expect(isGamesRoute("/gameManagement/bingo/tickets/gm-1")).toBe(true);
  });
  it("matches /gameManagement/subGames/:typeId/:id", () => {
    expect(isGamesRoute("/gameManagement/subGames/bingo/gm-1")).toBe(true);
  });
  it("matches /gameManagement/closeDay/:typeId/:id", () => {
    expect(isGamesRoute("/gameManagement/closeDay/bingo/gm-1")).toBe(true);
  });
  it("does NOT match unrelated paths", () => {
    expect(isGamesRoute("/gameManagement/foo/bar/baz/extra")).toBe(false);
    expect(isGamesRoute("/foo")).toBe(false);
  });
});
