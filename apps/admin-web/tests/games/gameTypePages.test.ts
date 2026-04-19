// Render tests for gameType pages (PR-A3 bolk 1).
//
// Focus: verify HTML scaffolding matches the legacy shell
// (breadcrumb, panel-heading, table columns, disabled-button placeholder).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderGameTypeListPage } from "../../src/pages/games/gameType/GameTypeListPage.js";
import { renderGameTypeViewPage } from "../../src/pages/games/gameType/GameTypeViewPage.js";
import {
  renderGameTypeAddPage,
  renderGameTypeEditPage,
} from "../../src/pages/games/gameType/GameTypeAddEditPage.js";
import { renderGameTypeTestPage } from "../../src/pages/games/gameType/GameTypeTestPage.js";
import { initI18n } from "../../src/i18n/I18n.js";
import { isGamesRoute, mountGamesRoute } from "../../src/pages/games/index.js";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("GameTypeListPage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    initI18n();
    globalThis.fetch = (async () =>
      okJson([
        { slug: "bingo", title: "Game 1", description: "", route: "", isEnabled: true, sortOrder: 1, settings: {}, createdAt: "", updatedAt: "" },
        { slug: "rocket", title: "Game 2", description: "", route: "", isEnabled: true, sortOrder: 2, settings: {}, createdAt: "", updatedAt: "" },
      ])) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders title + breadcrumb + Add-button placeholder", async () => {
    const c = document.createElement("div");
    await renderGameTypeListPage(c);
    expect(c.querySelector(".content-header h1")?.textContent).toBeTruthy();
    expect(c.querySelector(".breadcrumb")).not.toBeNull();
    const addBtn = c.querySelector("button[disabled]");
    expect(addBtn).not.toBeNull();
    expect(addBtn?.getAttribute("title")).toContain("BIN-620");
  });

  it("renders one row per GameType after fetch resolves", async () => {
    const c = document.createElement("div");
    await renderGameTypeListPage(c);
    // The DataTable mounts inside #gameType-list-table
    const table = c.querySelector("#gameType-list-table table");
    expect(table).not.toBeNull();
    const rows = c.querySelectorAll("#gameType-list-table tbody tr");
    expect(rows.length).toBe(2);
  });

  it("action column links to view and shows disabled edit (BIN-620)", async () => {
    const c = document.createElement("div");
    await renderGameTypeListPage(c);
    const firstRow = c.querySelector("#gameType-list-table tbody tr");
    expect(firstRow?.querySelector('a[href="#/gameType/view/bingo"]')).not.toBeNull();
    const editBtn = firstRow?.querySelector("button[disabled]");
    expect(editBtn).not.toBeNull();
  });
});

describe("GameTypeViewPage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    initI18n();
    globalThis.fetch = (async () =>
      okJson([
        {
          slug: "bingo",
          title: "Game 1",
          description: "",
          route: "",
          isEnabled: true,
          sortOrder: 1,
          settings: { row: 5, columns: 5, pattern: true },
          createdAt: "",
          updatedAt: "",
        },
      ])) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders read-only fields for a known GameType", async () => {
    const c = document.createElement("div");
    await renderGameTypeViewPage(c, "bingo");
    const inputs = c.querySelectorAll("input[readonly]");
    expect(inputs.length).toBeGreaterThan(0);
    // Breadcrumb
    expect(c.querySelector(".breadcrumb")).not.toBeNull();
  });

  it("shows 'not found' error for unknown id", async () => {
    const c = document.createElement("div");
    await renderGameTypeViewPage(c, "missing-slug");
    const alert = c.querySelector(".alert.alert-danger");
    expect(alert?.textContent).toContain("missing-slug");
  });
});

describe("GameTypeAddEditPage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    initI18n();
    globalThis.fetch = (async () =>
      okJson([
        {
          slug: "bingo",
          title: "Game 1",
          description: "",
          route: "",
          isEnabled: true,
          sortOrder: 1,
          settings: {},
          createdAt: "",
          updatedAt: "",
        },
      ])) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("add-page renders a disabled submit + BIN-620 banner", async () => {
    const c = document.createElement("div");
    await renderGameTypeAddPage(c);
    const submit = c.querySelector('button[type="submit"][disabled]');
    expect(submit).not.toBeNull();
    expect(c.textContent).toContain("BIN-620");
  });

  it("edit-page pre-fills name from fetched GameType", async () => {
    const c = document.createElement("div");
    await renderGameTypeEditPage(c, "bingo");
    const nameInput = c.querySelector<HTMLInputElement>('input[name="name"]');
    expect(nameInput?.value).toBe("Game 1");
    // Form is disabled pending BIN-620
    expect(nameInput?.disabled).toBe(true);
  });
});

describe("GameTypeTestPage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    initI18n();
    globalThis.fetch = (async () =>
      okJson([
        { slug: "bingo", title: "G1", description: "", route: "", isEnabled: true, sortOrder: 1, settings: {}, createdAt: "", updatedAt: "" },
      ])) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders thumbs after fetch", async () => {
    const c = document.createElement("div");
    await renderGameTypeTestPage(c);
    const img = c.querySelector("#gameType-test-thumbs img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("G1");
  });
});

describe("games route dispatcher", () => {
  it("isGamesRoute matches static and dynamic paths", () => {
    expect(isGamesRoute("/gameType")).toBe(true);
    expect(isGamesRoute("/gameType/add")).toBe(true);
    expect(isGamesRoute("/gameType/test")).toBe(true);
    expect(isGamesRoute("/gameType/view/bingo")).toBe(true);
    expect(isGamesRoute("/gameType/edit/bingo")).toBe(true);
    expect(isGamesRoute("/gameType/view/bingo?hl=1")).toBe(true);
    expect(isGamesRoute("/nonsense")).toBe(false);
    expect(isGamesRoute("/gameType/weirdthing")).toBe(false);
  });

  it("mountGamesRoute handles unknown-dynamic with a 404 box", () => {
    const c = document.createElement("div");
    mountGamesRoute(c, "/gameType/something-unknown/extra/segments");
    expect(c.querySelector(".box.box-danger")).not.toBeNull();
  });
});
